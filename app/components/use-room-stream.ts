'use client';

import { useCallback, useRef, useState } from 'react';
import type React from 'react';
import { emitPoints } from '@/lib/points-bus';
import { readSse } from '@/lib/sse-client';
import type { ThoughtView } from '@/components/thought-block';
import type { PersonaCurrent } from '@/components/persona-switch';
import type { QrAuto } from '@/lib/quick-replies';
import type { RoomGenMode as GenMode, RoomMessageView } from '@/components/room-message-row';

// 群聊的流式生成（从 room-chat.tsx 拆出）：send / auto / regenerate / continue 都走 streamReply，
// run 负责一整轮（自动继续最多 5 次、自动推进再让最多两位成员接话、快捷回复的自动触发）。
// 和单聊的 useGenerationStream 共用 readSse；没直接复用那个 hook，因为群聊多一个 speaker 事件、
// streaming 要跨多次请求（一轮里可能连着 3 位成员 + 自动继续）、done 时总是 emitPoints 并延迟 600ms 自动翻译。

export function useRoomStream({ roomId, strategy, speakerId, autoMode, persona, setMessages, setError, setOpenActions, resync, qrAutoRef, autoTranslateRef, translateRef }: {
  roomId: number;
  strategy: string;
  speakerId: string;
  autoMode: boolean;
  persona: PersonaCurrent;
  setMessages: React.Dispatch<React.SetStateAction<RoomMessageView[]>>;
  setError: (value: string) => void;
  setOpenActions: (value: number | string | null) => void;
  resync: () => Promise<void>;
  qrAutoRef: React.MutableRefObject<(kind: keyof QrAuto) => Promise<void>>;
  autoTranslateRef: React.MutableRefObject<boolean>;
  translateRef: React.MutableRefObject<(id: number, quiet?: boolean) => Promise<void>>;
}) {
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef<number | null>(null);
  // 乐观插入的玩家消息用当前身份（读 ref，切换身份后不必重建回调）
  const personaRef = useRef(persona);
  personaRef.current = persona;

  const streamReply = useCallback(async (mode: GenMode) => {
    const stamp = Date.now();
    const target = mode.kind === 'regenerate' || mode.kind === 'continue' ? mode.messageId : null;
    const streamKey: number | string = target ?? `stream-${stamp}`;
    let base = '';
    if (mode.kind === 'send') {
      setMessages((prev) => [...prev, { id: `local-${stamp}`, role: 'user', speakerId: null, content: mode.text, personaName: personaRef.current.name, personaAvatar: personaRef.current.avatar }]);
    }
    if (target === null) {
      setMessages((prev) => [...prev, { id: streamKey, role: 'assistant', speakerId: null, content: '' }]);
    } else {
      setMessages((prev) => prev.map((item) => {
        if (item.id !== target) return item;
        base = mode.kind === 'continue' ? item.content : '';
        return { ...item, content: base, ...(mode.kind === 'regenerate' ? { thought: null } : {}) };
      }));
    }
    setStreamingId(streamKey);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    let thinking = '';
    let completed = false;
    autoContinueRef.current = null;
    try {
      const payload = mode.kind === 'send'
        ? { text: mode.text, speakerId: strategy === 'manual' ? speakerId : undefined }
        : mode.kind === 'auto'
          ? mode.speakerId
            ? { auto: true, speakerId: mode.speakerId, force: true }
            : { auto: true, speakerId: strategy === 'manual' ? speakerId : undefined }
          : { mode: mode.kind, messageId: mode.messageId };
      const response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(detail?.message || `请求失败（${response.status}）`);
      }
      if (!response.body) throw new Error('没有收到响应');
      await readSse<{ type: string; text?: string; message?: string; messageId?: number; speakerId?: string; name?: string; content?: string; candidateIndex?: number; candidateCount?: number; reasoning?: ThoughtView | null; autoContinue?: boolean }>(response.body, (event) => {
        if (event.type === 'speaker') {
        setTyping(event.name ?? null);
        setMessages((prev) => prev.map((item) => (item.id === streamKey ? { ...item, speakerId: event.speakerId ?? item.speakerId } : item)));
      } else if (event.type === 'reasoning' && event.text) {
        thinking += event.text;
        const live = thinking;
        setMessages((prev) => prev.map((item) => (item.id === streamKey ? { ...item, thought: { t: live, ms: 0 } } : item)));
      } else if (event.type === 'delta' && event.text) {
        full += event.text;
        const shown = base ? base + full : full;
        setMessages((prev) => prev.map((item) => (item.id === streamKey ? { ...item, content: shown } : item)));
      } else if (event.type === 'done') {
        completed = true;
        emitPoints(event as { balance?: unknown; cost?: unknown });
        if (event.autoContinue && typeof event.messageId === 'number') autoContinueRef.current = event.messageId;
        if (autoTranslateRef.current && typeof event.messageId === 'number' && !event.autoContinue) {
          const doneId = event.messageId;
          setTimeout(() => void translateRef.current(doneId, true), 600);
        }
        setMessages((prev) =>
          prev.map((item) =>
            item.id === streamKey
              ? {
                  ...item,
                  id: event.messageId ?? item.id,
                  content: event.content ?? full,
                  translation: null,
                  thought: 'reasoning' in event ? event.reasoning ?? null : item.thought,
                  speakerId: event.speakerId ?? item.speakerId,
                  ...(event.candidateCount ? { candidateCount: event.candidateCount, selected: event.candidateIndex ?? event.candidateCount - 1 } : {}),
                }
              : item,
          ),
        );
      } else if (event.type === 'error') {
        completed = true;
        setError(event.message ?? '生成失败');
      }
      });
      // 流断了却没收到结束事件（网络掉线 / 代理断开）：提示一下，已生成的部分下面会和服务端对齐
      if (!completed && !controller.signal.aborted) setError('连接中断了，已和服务器同步');
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') setError((caught as Error).message);
    } finally {
      setTyping(null);
      setStreamingId(null);
      abortRef.current = null;
      if (!completed) await new Promise((resolve) => setTimeout(resolve, 400));
      await resync();
    }
    return completed;
  }, [roomId, speakerId, strategy, resync]);

  const run = useCallback(async (mode: GenMode) => {
    if (streaming) return;
    setError('');
    setOpenActions(null);
    setStreaming(true);
    let ok = false;
    try {
      if (mode.kind !== 'send') await qrAutoRef.current('groupDraft');
      ok = await streamReply(mode);
      // ST 自动继续：回复不到目标长度就接着写，最多 5 次
      for (let round = 0; ok && round < 5 && autoContinueRef.current !== null; round += 1) {
        const id = autoContinueRef.current;
        autoContinueRef.current = null;
        ok = await streamReply({ kind: 'continue', messageId: id });
      }
      autoContinueRef.current = null;
      // 自动推进：玩家发言后的首轮回应之后，再让最多两位成员接话
      if (ok && autoMode && mode.kind === 'send') {
        for (let index = 0; index < 2; index += 1) {
          let next = await streamReply({ kind: 'auto' });
          for (let round = 0; next && round < 5 && autoContinueRef.current !== null; round += 1) {
            const id = autoContinueRef.current;
            autoContinueRef.current = null;
            next = await streamReply({ kind: 'continue', messageId: id });
          }
          autoContinueRef.current = null;
          if (!next) break;
        }
      }
    } finally {
      setStreaming(false);
      setTyping(null);
    }
    if (mode.kind === 'send') await qrAutoRef.current('user');
    if (ok) await qrAutoRef.current('ai');
  }, [streaming, streamReply, autoMode]);

  return { streaming, typing, streamingId, abortRef, run };
}
