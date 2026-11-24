'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { emitPoints } from '@/lib/points-bus';
import { readSse } from '@/lib/sse-client';
import type { ThoughtView } from '@/components/thought-block';
import type { ChatMessageView } from '@/components/chat-room';

// 对话页的流式生成（从 chat-room.tsx 拆出）：发送 / 重新生成 / 继续都走 streamInto，
// 把 SSE 的思考、正文增量写进目标那一楼；结束（含中断、报错）后和数据库对齐一次。

type StreamEvent = {
  type: string;
  text?: string;
  free?: number;
  message?: string;
  messageId?: number | null;
  content?: string;
  candidateIndex?: number;
  candidateCount?: number;
  cost?: number;
  balance?: number;
  reasoning?: ThoughtView | null;
  autoContinue?: boolean;
  cut?: boolean;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type TranslatePrefs = { target: string; auto: 'none' | 'responses' | 'inputs' | 'both'; modelLang: string };

export function useGenerationStream({ setMessages, setError, setBilling, resync, translatePrefsRef, translateRef }: {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageView[]>>;
  setError: (value: string) => void;
  setBilling: (value: { cost: number; balance: number; free?: number } | null) => void;
  resync: () => Promise<void>;
  translatePrefsRef: React.MutableRefObject<TranslatePrefs>;
  translateRef: React.MutableRefObject<(id: number, auto?: boolean) => Promise<void>>;
}) {
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  // 本次流里收到了错误事件且没有产出（服务端已保存玩家消息）
  const streamErrorRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef<{ id: number; content: string } | null>(null);
  // 页面内跳走（客户端路由）时组件卸载：中止正在跑的流，服务端照常保存已生成的部分（和整页离开一致）
  useEffect(() => () => { autoContinueRef.current = null; abortRef.current?.abort(); }, []);

  const streamInto = useCallback(
    async (url: string, payload: unknown, targetId: number | string, onAccepted?: () => void, prefix = ''): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setStreamingId(targetId);
      setError('');
      let text = '';
      let thinking = '';
      let completed = false;
      let accepted = false;
      let doneId: number | null = null;
      autoContinueRef.current = null;
      streamErrorRef.current = false;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          signal: controller.signal,
        });
        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(detail?.message || `请求失败（${response.status}）`);
        }
        if (!response.body) throw new Error('没有收到响应');
        accepted = true;
        onAccepted?.();

        await readSse<StreamEvent>(response.body, (event) => {
          if (event.type === 'reasoning' && event.text) {
            thinking += event.text;
            const live = thinking;
            setMessages((prev) => prev.map((item) => (item.id === targetId ? { ...item, thought: { t: live, ms: 0 } } : item)));
          } else if (event.type === 'delta' && event.text) {
            text += event.text;
            setMessages((prev) => prev.map((item) => (item.id === targetId ? { ...item, content: prefix + text } : item)));
          } else if (event.type === 'done') {
            completed = true;
            if (typeof event.messageId === 'number') doneId = event.messageId;
            // ST 自动继续：服务端判断回复还没到目标长度
            if (event.autoContinue && typeof event.messageId === 'number') autoContinueRef.current = { id: event.messageId, content: event.content ?? text };
            if (typeof event.cost === 'number' && typeof event.balance === 'number') { setBilling({ cost: event.cost, balance: event.balance, free: event.free }); emitPoints(event); }
            setMessages((prev) =>
              prev.map((item) =>
                item.id === targetId
                  ? {
                      ...item,
                      id: event.messageId ?? item.id,
                      content: event.content ?? text,
                      thought: 'reasoning' in event ? event.reasoning ?? null : item.thought,
                      candidateCount: event.candidateCount ?? item.candidateCount,
                      selected: event.candidateIndex ?? item.selected,
                      cut: event.cut === true,
                    }
                  : item,
              ),
            );
          } else if (event.type === 'error') {
            completed = true;
            if (!text) streamErrorRef.current = true;
            setError(event.message ?? '生成失败');
          }
        });
        // 流断了却没收到结束事件（网络掉线 / 代理断开）：提示一下，已生成的部分下面会和服务端对齐
        if (!completed && !controller.signal.aborted) setError('连接中断了，已和服务器同步');
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') setError((caught as Error).message);
        // 中断时保留已生成的部分（服务端也会保存），下面统一和数据库对齐
      } finally {
        setStreaming(false);
        setStreamingId(null);
        abortRef.current = null;
        // 中断后服务端还要几百毫秒落库，稍等一下再取
        if (!completed) await sleep(400);
        await resync();
        // ST「自动翻译回复」：回复落库后翻成目标语言（失败不打断对话）
        const auto = translatePrefsRef.current.auto;
        if (completed && doneId !== null && !streamErrorRef.current && (auto === 'responses' || auto === 'both')) void translateRef.current(doneId, true);
      }
      return accepted;
    },
    [resync],
  );

  return { streaming, streamingId, abortRef, autoContinueRef, streamErrorRef, streamInto };
}
