'use client';
import { ThoughtBlock, useThoughtsOpen, type ThoughtView } from '@/components/thought-block';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasMvuCommands } from '@/lib/mvu';
import { TypingDots } from '@/components/rp-text';
import { RichText } from '@/components/rich-text';
import type { RegexRule } from '@/lib/resources';
import { ModelPicker } from '@/components/model-picker';
import { PersonaSwitch, UserAvatar, type PersonaCurrent, type PersonaOption } from '@/components/persona-switch';
import { Select } from '@/components/ui-select';

type RoomMessageView = { id: number | string; role: 'user' | 'assistant'; speakerId: string | null; content: string; candidateCount?: number; selected?: number; checkpoint?: number | null; personaName?: string | null; personaAvatar?: string | null; thought?: ThoughtView | null };
type Member = { id: string; name: string; initial: string; hue: number; muted?: boolean };

type Props = {
  roomId: number;
  strategy: string;
  members: Member[];
  initialMessages: RoomMessageView[];
  userName: string;
  /** 身份切换：当前生效身份、可选身份、锁定在本群聊的身份 */
  persona?: { current: PersonaCurrent; options: PersonaOption[]; lockedId: number | null };
  autoMode?: boolean;
  defaultSpeakerId?: string | null;
  // 「仅显示」正则：玩家规则 + 成员角色卡自带脚本（按发言角色挑）
  displayRules?: RegexRule[];
  memberRules?: Record<string, RegexRule[]>;
};

const ICONS = {"copy": "M9 9h10v10H9zM5 15V5h10", "check": "m5 12 5 5 9-10", "edit": "M4 20h4L19 9l-4-4L4 16zM13 7l4 4", "regen": "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5", "branch": "M6 4v10M6 14a4 4 0 0 0 4 4h4M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8v2a4 4 0 0 1-4 4H6", "x": "M6 6l12 12M18 6 6 18", "prev": "m15 6-6 6 6 6", "next": "m9 6 6 6-6 6", "checkpoint": "M7 4h10v16l-5-3.5L7 20z"} as const;
function Ico({ name }: { name: keyof typeof ICONS }) {
  return <svg className="p-icon rd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

type GenMode = { kind: 'send'; text: string } | { kind: 'auto'; speakerId?: string } | { kind: 'regenerate' | 'continue'; messageId: number };

const STRATEGY_HINT: Record<string, string> = {
  natural: '自然：你叫到谁的名字，谁就先答；否则轮流。',
  roundRobin: '轮流：发言次数最少的角色先答。',
  manual: '手动：你自己选本轮由谁回应。',
  pooled: '随机：每轮从成员里抽一个。',
};

export function RoomChat({ roomId, strategy, members, initialMessages, userName: initialUserName, persona: personaInit, autoMode = false, defaultSpeakerId, displayRules = [], memberRules = {} }: Props) {
  const [persona, setPersona] = useState<PersonaCurrent>(personaInit?.current ?? { id: null, name: initialUserName, avatar: null });
  const [personaLock, setPersonaLock] = useState<number | null>(personaInit?.lockedId ?? null);
  const userName = persona.name;
  const [messages, setMessages] = useState<RoomMessageView[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [speakerId, setSpeakerId] = useState(defaultSpeakerId && members.some((member) => member.id === defaultSpeakerId) ? defaultSpeakerId : members[0]?.id ?? '');
  const [openActions, setOpenActions] = useState<number | string | null>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef<number | null>(null);
  const thoughtsOpen = useThoughtsOpen();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // 每楼「此前所有变量命令」的累积指纹：前面楼层改了变量，后面的状态栏要重新取（同单聊 chat-room.tsx）
  const mvuHashes = useRef(new Map<number | string, { content: string; h: number }>());
  const mvuRev = useMemo(() => {
    const rev = new Map<number, string>();
    const cache = mvuHashes.current;
    let acc = 0;
    for (const m of messages) {
      if (m.role === 'assistant') {
        let item = cache.get(m.id);
        if (!item || item.content !== m.content) {
          let h = 0;
          if (hasMvuCommands(m.content)) {
            for (let i = 0; i < m.content.length; i += 1) h = (Math.imul(31, h) + m.content.charCodeAt(i)) | 0;
            h = (Math.imul(31, h) + Number(m.id)) | 0 || 1;
          }
          item = { content: m.content, h };
          cache.set(m.id, item);
        }
        if (item.h) acc = (Math.imul(1000003, acc) + item.h) | 0;
      }
      if (typeof m.id === 'number') rev.set(m.id, String(acc));
    }
    return rev;
  }, [messages]);

  const memberOf = (id: string | null) => members.find((member) => member.id === id);
  const firstUserIndex = useMemo(() => {
    const index = messages.findIndex((message) => message.role === 'user');
    return index < 0 ? messages.length : index - 1;
  }, [messages]);

  const resync = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: RoomMessageView[] };
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // 下次刷新再对齐
    }
  }, [roomId]);

  // 生成一条回复：send 带玩家消息；auto 自动推进；regenerate 给最新角色消息加一个候选；continue 接着最新角色消息写
  const streamReply = useCallback(async (mode: GenMode) => {
    const stamp = Date.now();
    const target = mode.kind === 'regenerate' || mode.kind === 'continue' ? mode.messageId : null;
    const streamKey: number | string = target ?? `stream-${stamp}`;
    let base = '';
    if (mode.kind === 'send') {
      setMessages((prev) => [...prev, { id: `local-${stamp}`, role: 'user', speakerId: null, content: mode.text, personaName: persona.name, personaAvatar: persona.avatar }]);
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
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          let event: { type: string; text?: string; message?: string; messageId?: number; speakerId?: string; name?: string; content?: string; candidateIndex?: number; candidateCount?: number; reasoning?: ThoughtView | null; autoContinue?: boolean };
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
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
            if (event.autoContinue && typeof event.messageId === 'number') autoContinueRef.current = event.messageId;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === streamKey
                  ? {
                      ...item,
                      id: event.messageId ?? item.id,
                      content: event.content ?? full,
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
        }
      }
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
    try {
      let ok = await streamReply(mode);
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
  }, [streaming, streamReply, autoMode]);

  // ST 成员列表的「让 TA 发言」：无视调度和静音，指定这位成员接着说一条
  const forceTalk = useCallback((memberId: string) => {
    void run({ kind: 'auto', speakerId: memberId });
  }, [run]);

  // ST「继续」：最后一条是角色消息就接着写；否则让下一位角色接话（同群聊里的「推进」）
  const continueLast = useCallback(() => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && typeof last.id === 'number') void run({ kind: 'continue', messageId: last.id });
    else void run({ kind: 'auto' });
  }, [messages, run]);

  const switchCandidate = useCallback(async (message: RoomMessageView, index: number) => {
    if (typeof message.id !== 'number') return;
    const count = message.candidateCount ?? 1;
    if (index < 0 || index >= count) return;
    setSwitching(message.id);
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages/${message.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected: index }) });
      const data = (await response.json().catch(() => ({}))) as { message?: RoomMessageView & { message?: string } };
      if (response.ok && data.message) {
        const updated = data.message;
        setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: updated.content, selected: updated.selected, candidateCount: updated.candidateCount, thought: updated.thought ?? null } : item)));
      } else setError('切换失败');
    } finally {
      setSwitching(null);
    }
  }, [roomId]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const content = editing.draft.trim();
    if (!content) return;
    const response = await fetch(`/api/rooms/${roomId}/messages/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const data = (await response.json().catch(() => ({}))) as { message?: string | RoomMessageView };
    if (!response.ok) {
      setError(typeof data.message === 'string' ? data.message : '保存失败');
      return;
    }
    setMessages((prev) => prev.map((item) => (item.id === editing.id ? { ...item, content } : item)));
    setEditing(null);
  }, [editing, roomId]);

  const remove = useCallback(async (id: number) => {
    const response = await fetch(`/api/rooms/${roomId}/messages/${id}`, { method: 'DELETE' });
    setConfirming(null);
    if (response.ok) setMessages((prev) => prev.filter((item) => item.id !== id));
    else setError('删除失败');
  }, [roomId]);

  const copy = useCallback(async (message: RoomMessageView) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      setError('复制失败');
    }
  }, []);

  const branch = useCallback(async (message: RoomMessageView, checkpoint = false) => {
    if (typeof message.id !== 'number') return;
    if (checkpoint && message.checkpoint) {
      window.location.href = `/rooms/${message.checkpoint}`;
      return;
    }
    const response = await fetch(`/api/rooms/${roomId}/branch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id, checkpoint }) });
    const data = (await response.json().catch(() => ({}))) as { room?: { id: number }; message?: string };
    if (response.ok && data.room) window.location.href = `/rooms/${data.room.id}?from=${roomId}`;
    else setError(data.message ?? '创建分支失败');
  }, [roomId]);

  // ST「代写」：让 AI 以玩家身份写一句，流式写进输入框（输入框里已有的字当方向提示）
  const impersonate = useCallback(async () => {
    if (streaming || impersonating) return;
    const hint = draft.trim();
    setImpersonating(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${roomId}/impersonate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hint }) });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? '代写失败');
        return;
      }
      setDraft('');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as { type: string; text?: string; message?: string };
            if (event.type === 'delta' && event.text) { text += event.text; setDraft(text); }
            else if (event.type === 'done') setDraft(event.text ?? text);
            else if (event.type === 'error') setError(event.message ?? '代写失败');
          } catch {
            // 忽略坏行
          }
        }
      }
    } catch {
      setError('代写失败，请稍后再试');
    } finally {
      setImpersonating(false);
    }
  }, [draft, impersonating, roomId, streaming]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    void run({ kind: 'send', text });
  }, [draft, streaming, run]);

  return (
    <>
      <div className="p-chat-scroll">
        <div className="p-chat-col">
          {messages.length === 0 && (
            <section className="room-empty" aria-label="房间开场">
              <p className="room-empty-kicker">群像 · 第一场</p>
              <h2 className="room-empty-title">这场戏还没开始</h2>
              <p className="room-empty-copy">先写一句开场，或者点一位角色，让 TA 先开口。</p>
              <div className="room-empty-cast">
                {members.filter((member) => !member.muted).map((member) => (
                  <button key={member.id} type="button" className="room-empty-chip" title={`让${member.name}先开口`} disabled={streaming} onClick={() => forceTalk(member.id)}>
                    <span className="p-avatar" style={{ ['--size' as string]: '24px', ['--h' as string]: member.hue }}>{member.initial}</span>
                    {member.name}
                  </button>
                ))}
              </div>
            </section>
          )}
          {messages.map((message, index) => {
            const member = memberOf(message.speakerId);
            const isUser = message.role === 'user';
            const isLast = index === messages.length - 1;
            const numericId = typeof message.id === 'number' ? message.id : null;
            const isStreamingThis = streamingId === message.id || (isLast && streaming && !isUser && streamingId === null);
            const isEditing = editing !== null && editing.id === message.id;
            const count = message.candidateCount ?? 1;
            const selected = message.selected ?? 0;
            const canSwipe = !isUser && isLast && numericId !== null && !isStreamingThis && Boolean(message.content) && !isEditing;
            // 开场白（玩家还没说过话之前的角色消息）：只在备选开场白之间切换，不生成新版（同单聊 / ST）
            const isOpening = !isUser && index <= firstUserIndex;
            return (
              <article
                key={message.id}
                id={`msg-${message.id}`}
                className={`p-msg${isUser ? ' p-msg-user' : ''}${openActions === message.id ? ' is-tools-open' : ''}${isLast ? ' is-latest' : ''}${isStreamingThis ? ' is-streaming' : ''}`}
                onTouchStart={canSwipe ? (event) => { const t = event.touches[0]; swipeStart.current = { x: t.clientX, y: t.clientY }; } : undefined}
                onTouchEnd={canSwipe ? (event) => {
                  // 手机端左右滑动最新回复：右滑看上一版，左滑看下一版 / 生成新版（同单聊）
                  const start = swipeStart.current; swipeStart.current = null;
                  if (!start || streaming) return;
                  const t = event.changedTouches[0];
                  const dx = t.clientX - start.x; const dy = t.clientY - start.y;
                  if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
                  if (dx > 0 && selected > 0) void switchCandidate(message, selected - 1);
                  else if (dx < 0 && selected < count - 1) void switchCandidate(message, selected + 1);
                  else if (dx < 0 && !isOpening) void run({ kind: 'regenerate', messageId: numericId! });
                } : undefined}
              >
                {isUser ? (
                  <UserAvatar name={message.personaName || userName} avatar={message.personaName ? message.personaAvatar ?? null : persona.avatar} />
                ) : (
                  <span className="p-avatar" style={{ ['--size' as string]: '32px', ['--h' as string]: member?.hue ?? 212 }}>
                    {member?.initial ?? '·'}
                  </span>
                )}
                <div>
                  <div className="p-msg-name">{isUser ? message.personaName || userName : member?.name ?? '角色'}</div>
                  {isEditing ? (
                    <div>
                      <textarea
                        className="p-textarea"
                        value={editing.draft}
                        rows={Math.min(16, Math.max(3, editing.draft.split('\n').length + 1))}
                        autoFocus
                        onChange={(event) => setEditing({ id: editing.id, draft: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEditing(null);
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            void saveEdit();
                          }
                        }}
                        aria-label="编辑消息"
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!editing.draft.trim()} onClick={() => void saveEdit()}>保存</button>
                        <button className="p-btn p-btn--sm" type="button" onClick={() => setEditing(null)}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {!isUser && message.thought?.t ? <ThoughtBlock thought={message.thought} live={isStreamingThis && !message.content} defaultOpen={thoughtsOpen} /> : null}
                      <div className="p-msg-copy p-msg-text">
                        {message.content
                          ? <RichText text={message.content} streaming={isStreamingThis} rules={[...(message.speakerId ? memberRules[message.speakerId] ?? [] : []), ...displayRules]} macros={{ char: member?.name ?? '', user: userName }} role={isUser ? 'user' : 'assistant'} depth={messages.length - 1 - index} variables={!isUser && numericId !== null && numericId > 0 ? { chatId: roomId, messageId: numericId, rev: mvuRev.get(numericId), room: true } : undefined} />
                          : isStreamingThis ? <TypingDots label={`${member?.name ?? '角色'}正在构思`} /> : null}
                      </div>
                      {message.checkpoint ? (
                        <a className="p-msg-checkpoint" href={`/rooms/${message.checkpoint}`}>
                          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checkpoint} /></svg>
                          <span>检查点</span>
                        </a>
                      ) : null}
                    </>
                  )}
                  {canSwipe && !(isOpening && count <= 1) && (
                    <div className="rp-swipe" role="group" aria-label="回复版本">
                      <button type="button" aria-label="上一版回复" disabled={selected <= 0 || switching === numericId || streaming} onClick={() => void switchCandidate(message, selected - 1)}><Ico name="prev" /></button>
                      <span className="rp-swipe-index" aria-live="polite">{selected + 1} / {count}</span>
                      {selected < count - 1 ? (
                        <button type="button" aria-label="下一版回复" disabled={switching === numericId || streaming} onClick={() => void switchCandidate(message, selected + 1)}><Ico name="next" /></button>
                      ) : isOpening ? (
                        <button type="button" aria-label="下一版回复" disabled><Ico name="next" /></button>
                      ) : (
                        <button type="button" className="rp-swipe-new" aria-label="生成新的一版" title="生成新的一版" disabled={streaming} onClick={() => void run({ kind: 'regenerate', messageId: numericId! })}><Ico name="next" /></button>
                      )}
                    </div>
                  )}
                  {!isEditing && numericId !== null && !isStreamingThis && (
                    <button className="p-msg-more" type="button" aria-label="消息操作" aria-expanded={openActions === message.id} onClick={() => setOpenActions(openActions === message.id ? null : message.id)}>⋯</button>
                  )}
                  {!isEditing && numericId !== null && !isStreamingThis && (
                    <div className="p-msg-tools">
                      {confirming === numericId ? (
                        <>
                          <button type="button" aria-label="确认删除" title="确认删除" onClick={() => void remove(numericId)}><Ico name="check" /></button>
                          <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirming(null)}><Ico name="x" /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" aria-label="复制消息" title="复制消息" onClick={() => void copy(message)}>{copied === message.id ? <Ico name="check" /> : <Ico name="copy" />}</button>
                          <button type="button" aria-label="编辑消息" title="编辑消息" disabled={streaming} onClick={() => setEditing({ id: numericId, draft: message.content })}><Ico name="edit" /></button>
                          {!isUser && isLast && !isOpening && (
                            <button type="button" data-act="regen" aria-label="重新生成" title="重新生成" disabled={streaming} onClick={() => void run({ kind: 'regenerate', messageId: numericId })}><Ico name="regen" /></button>
                          )}
                          <button type="button" data-act="branch" aria-label="从这里创建分支" title="分支" disabled={streaming} onClick={() => void branch(message)}><Ico name="branch" /></button>
                          <button type="button" data-act="checkpoint" aria-label={message.checkpoint ? '打开检查点' : '在这里创建检查点'} title={message.checkpoint ? '打开检查点' : '检查点'} aria-pressed={Boolean(message.checkpoint)} disabled={streaming} onClick={() => void branch(message, true)}><Ico name="checkpoint" /></button>
                          <button type="button" aria-label="删除消息" title="删除" disabled={streaming} onClick={() => setConfirming(numericId)}><Ico name="x" /></button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          <div ref={bottomRef} className="chat-bottom" />
        </div>
      </div>

      <div className="p-chat-compose">
        <div className="p-chat-col">
          {error && <p role="alert" className="p-form-error" style={{ margin: '0 0 8px' }}>{error}</p>}
          <div className="p-rp-compose-context">
            <span className="p-compose-persona">{STRATEGY_HINT[strategy] ?? ''}</span>
            {typing && <span className="p-small">{typing} 正在输入…</span>}
            <span className="room-talk" role="group" aria-label="让成员发言">
              {members.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  className="room-talk-btn"
                  data-muted={member.muted ? '' : undefined}
                  title={`让${member.name}发言${member.muted ? '（已静音，仍可点名）' : ''}`}
                  aria-label={`让${member.name}发言`}
                  disabled={streaming || impersonating}
                  onClick={() => forceTalk(member.id)}
                >
                  <span className="p-avatar" style={{ ['--size' as string]: '24px', ['--h' as string]: member.hue }}>{member.initial}</span>
                </button>
              ))}
            </span>
            {strategy === 'manual' && (
              <label className="p-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                本轮由
                <Select className="p-select" style={{ width: 'auto', padding: '4px 8px' }} value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
                  {members.filter((member) => !member.muted).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </Select>
                回应
              </label>
            )}
          </div>
          <div className="p-chat-compose-row">
            <textarea
              className="p-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="说点什么，或者叫某个角色的名字…"
              aria-label="消息"
            />
            {streaming ? (
              <button className="p-chat-send" type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成">■</button>
            ) : (
              <button className="p-chat-send" type="button" onClick={() => send()} disabled={!draft.trim() || impersonating} aria-label="发送">↑</button>
            )}
          </div>
          <div className="p-compose-meta">
            <span className="p-chat-acts">
              <button className="p-chat-continue p-chat-act" type="button" disabled={streaming || impersonating || messages.length === 0} onClick={continueLast} title="不写台词，让角色接着上一条往下写；最后一条是你的话时，让下一位角色接话">▸ 继续</button>
              <button className="p-chat-act p-chat-imp" type="button" disabled={streaming || impersonating} onClick={() => void impersonate()} title="让 AI 以你的身份写一句（输入框里的字会当作方向提示），写完可以再改">{impersonating ? '代写中…' : '✎ 代写'}</button>
              {personaInit && (
                <PersonaSwitch
                  endpoint={`/api/rooms/${roomId}/persona`}
                  personas={personaInit.options}
                  lockedId={personaLock}
                  current={persona}
                  scopeLabel="本群聊"
                  onChange={(next) => { setPersonaLock(next.locked); setPersona(next.persona); }}
                />
              )}
              <ModelPicker roomId={roomId} />
            </span>
            <span>Enter 发送 · Shift + Enter 换行 · 群聊回复由模型生成</span>
          </div>
        </div>
      </div>
    </>
  );
}
