'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/settings-ui';
import { ReportButton } from '@/components/report-button';
import { RpText, TypingDots } from '@/components/rp-text';
import { ModelPicker, NewbieTip } from '@/components/model-picker';

export type ChatAttachmentView = { kind: 'image' | 'audio'; url: string; prompt?: string; createdAt: number };

export type ChatMessageView = {
  id: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  candidateCount: number;
  selected: number;
  bookmark?: boolean;
  attachment?: ChatAttachmentView | null;
  createdAt?: number;
};

type Props = {
  chatId: number;
  characterName: string;
  initialMessages: ChatMessageView[];
  initialHasMore?: boolean;
  quickReplies?: { label: string; content: string }[];
  media?: { image: boolean; tts: boolean; imageCost: number };
  title?: string;
  personaName?: string;
  characterCover?: string | null;
  characterHue?: number;
};

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
};


const ICONS = {"copy": "M9 9h10v10H9zM5 15V5h10", "check": "m5 12 5 5 9-10", "edit": "M4 20h4L19 9l-4-4L4 16zM13 7l4 4", "play": "M8 5v14l11-7z", "star": "m12 4 2.5 5.2 5.5.7-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.7z", "regen": "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5", "branch": "M6 4v10M6 14a4 4 0 0 0 4 4h4M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8v2a4 4 0 0 1-4 4H6", "x": "M6 6l12 12M18 6 6 18", "prev": "m15 6-6 6 6 6", "next": "m9 6 6 6-6 6", "flag": "M5 21V4M5 4h11l-2 4 2 4H5"} as const;
function Ico({ name }: { name: keyof typeof ICONS }) {
  return <svg className="p-icon rd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

// 消息时间：只在客户端格式化（服务器时区不同会导致 hydration 不一致）
function MsgTime({ at }: { at?: number }) {
  const [label, setLabel] = useState('');
  const [full, setFull] = useState('');
  useEffect(() => {
    if (!at) return;
    const d = new Date(at);
    const now = new Date();
    const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const sameDay = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    setLabel(sameDay ? hm : d.toDateString() === y.toDateString() ? `昨天 ${hm}` : `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`);
    setFull(d.toLocaleString('zh-CN', { hour12: false }));
  }, [at]);
  if (!at) return null;
  return <time className="p-msg-time" dateTime={new Date(at).toISOString()} title={full || undefined} suppressHydrationWarning>{label}</time>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function friendlyError(message: string): string {
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '网络连接失败，请检查网络后重试。';
  if (/点数不足|402/.test(message)) return '点数不足，先签到领点或兑换/充值后再试。';
  if (/429|频繁|限流/.test(message)) return '请求太频繁，稍等一会儿再试。';
  if (/模型未配置/.test(message)) return '模型未配置，请联系管理员。';
  return message;
}

// M1 对话：发送/重新生成走 SSE；编辑、删除、候选切换、分支走普通接口。
// 每次生成结束都和数据库对齐一次（中断时也把已生成的部分取回来）。
export function ChatRoom({ chatId, characterName, initialMessages, initialHasMore = false, quickReplies = [], media, title, personaName, characterCover = null, characterHue = 212 }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  useEffect(() => { try { setPreview(localStorage.getItem('tavern_compose_preview') === '1'); } catch {} }, []);
  const togglePreview = () => setPreview((on) => { try { localStorage.setItem('tavern_compose_preview', on ? '0' : '1'); } catch {} return !on; });
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<{ type: 'send' } | { type: 'regen'; message: ChatMessageView } | null>(null);
  const [billing, setBilling] = useState<{ cost: number; balance: number; free?: number } | null>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [openActions, setOpenActions] = useState<number | string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prependingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 只有读者本来就在底部时才跟随新内容；往上翻旧剧情时不打扰，改为显示「回到最新」
  const stickRef = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const lastCountRef = useRef(initialMessages.length);

  const scrollTarget = useCallback((): { top: number; height: number; client: number } => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') {
      return { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight };
    }
    const doc = document.scrollingElement ?? document.documentElement;
    return { top: doc.scrollTop, height: doc.scrollHeight, client: window.innerHeight };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const { top, height, client } = scrollTarget();
      const near = height - (top + client) < 140;
      stickRef.current = near;
      setAwayFromBottom(!near);
      if (near) setUnseen(0);
    };
    const el = scrollRef.current;
    el?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
    };
  }, [scrollTarget]);

  const jumpToLatest = useCallback(() => {
    stickRef.current = true;
    setUnseen(0);
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  // 输入框随内容长高（最多约 8 行），发送后回落
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    // 加载更早消息时保持当前阅读位置，不要跳到底部
    if (prependingRef.current) {
      prependingRef.current = false;
      return;
    }
    const grew = messages.length > lastCountRef.current;
    const lastIsUser = messages[messages.length - 1]?.role === 'user';
    lastCountRef.current = messages.length;
    if (stickRef.current || (grew && lastIsUser)) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    } else if (grew) {
      setUnseen((count) => count + 1);
    }
  }, [messages]);

  const resync = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: ChatMessageView[] };
      if (Array.isArray(data.messages)) setMessages(data.messages);
    } catch {
      // 对齐失败不影响本地内容，下次刷新再取
    }
  }, [chatId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder) return;
    const firstId = messages.find((message) => typeof message.id === 'number')?.id as number | undefined;
    if (!firstId) {
      setHasMore(false);
      return;
    }
    setLoadingOlder(true);
    const scroll = scrollRef.current;
    const beforeHeight = scroll?.scrollHeight ?? 0;
    try {
      const response = await fetch(`/api/chats/${chatId}/messages?before=${firstId}&limit=40`, { cache: 'no-store' });
      if (!response.ok) throw new Error('加载失败');
      const data = (await response.json()) as { messages?: ChatMessageView[]; hasMore?: boolean };
      if (Array.isArray(data.messages) && data.messages.length) {
        prependingRef.current = true;
        setMessages((prev) => [...data.messages!, ...prev]);
        setHasMore(Boolean(data.hasMore));
        requestAnimationFrame(() => {
          if (scroll) scroll.scrollTop += scroll.scrollHeight - beforeHeight;
        });
      } else {
        setHasMore(false);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }, [chatId, loadingOlder, messages]);

  const streamInto = useCallback(
    async (url: string, payload: unknown, targetId: number | string, onAccepted?: () => void): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setStreamingId(targetId);
      setError('');
      let text = '';
      let completed = false;
      let accepted = false;
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
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(5).trim()) as StreamEvent;
            } catch {
              continue;
            }
            if (event.type === 'delta' && event.text) {
              text += event.text;
              setMessages((prev) => prev.map((item) => (item.id === targetId ? { ...item, content: text } : item)));
            } else if (event.type === 'done') {
              completed = true;
              if (typeof event.cost === 'number' && typeof event.balance === 'number') setBilling({ cost: event.cost, balance: event.balance, free: event.free });
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === targetId
                    ? {
                        ...item,
                        id: event.messageId ?? item.id,
                        content: event.content ?? text,
                        candidateCount: event.candidateCount ?? item.candidateCount,
                        selected: event.candidateIndex ?? item.selected,
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
      }
      return accepted;
    },
    [resync],
  );

  // override：快捷动作（如「继续」）直接发送一段固定文本，不动用户正在写的草稿
  // ST 的「代写」：让 AI 以玩家身份写一句，流式写进输入框，玩家改完再发
  const [impersonating, setImpersonating] = useState(false);
  const impersonate = useCallback(async () => {
    if (impersonating || streaming) return;
    setImpersonating(true);
    setError('');
    const hint = draft.trim();
    setDraft('');
    try {
      const response = await fetch(`/api/chats/${chatId}/impersonate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hint }) });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setError(data.message ?? '代写失败');
        setDraft(hint);
        return;
      }
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
            const event = JSON.parse(line.slice(5));
            if (event.type === 'delta') { text += event.text; setDraft(text); }
            else if (event.type === 'done') { setDraft(event.text || text); if (typeof event.cost === 'number') setBilling({ cost: event.cost, balance: event.balance, free: event.free }); }
            else if (event.type === 'error') setError(event.message ?? '代写失败');
          } catch { /* 忽略坏分片 */ }
        }
      }
      inputRef.current?.focus();
    } catch {
      setError('代写失败，请稍后再试');
    } finally {
      setImpersonating(false);
    }
  }, [chatId, draft, impersonating, streaming]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || streaming) return;
    const stamp = Date.now();
    const assistantKey = `local-assistant-${stamp}`;
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${stamp}`, role: 'user', content: text, candidateCount: 0, selected: 0, createdAt: Date.now() },
      { id: assistantKey, role: 'assistant', content: '', candidateCount: 0, selected: 0, createdAt: Date.now() },
    ]);
    // 被限流/失败时不吞掉用户输入：请求没被接受就把草稿放回去
    const accepted = await streamInto(`/api/chats/${chatId}/messages`, { text }, assistantKey, () => { if (override === undefined) setDraft(''); });
    if (!accepted) {
      // 请求未被接受：撤掉本地乐观消息，避免留下空气泡
      setMessages((prev) => prev.filter((item) => item.id !== assistantKey && item.id !== `local-user-${stamp}`));
      if (override === undefined) setDraft((current) => (current ? current : text));
      setFailed({ type: 'send' });
    } else {
      setFailed(null);
    }
  }, [chatId, draft, streaming, streamInto]);

  const regenerate = useCallback(
    async (message: ChatMessageView) => {
      if (streaming || typeof message.id !== 'number') return;
      setEditing(null);
      setConfirming(null);
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: '' } : item)));
      setFailed(null);
      const accepted = await streamInto(`/api/messages/${message.id}/regenerate`, {}, message.id);
      if (!accepted) {
        // 重新生成没被接受：恢复原文，不把消息清空
        setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: message.content } : item)));
        setFailed({ type: 'regen', message });
      }
    },
    [streaming, streamInto],
  );

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const content = editing.draft.trim();
    if (!content) return;
    try {
      const response = await fetch(`/api/messages/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: ChatMessageView; messageText?: string };
      if (!response.ok || !data.message) throw new Error('保存失败');
      const saved = data.message;
      setMessages((prev) => prev.map((item) => (item.id === editing.id ? { ...item, content: saved.content } : item)));
      setEditing(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [editing]);

  const remove = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      setMessages((prev) => prev.filter((item) => item.id !== id));
      setConfirming(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  const switchCandidate = useCallback(async (message: ChatMessageView, index: number) => {
    if (typeof message.id !== 'number') return;
    setSwitching(message.id);
    try {
      const response = await fetch(`/api/messages/${message.id}/candidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = (await response.json().catch(() => ({}))) as { content?: string; index?: number; message?: string };
      if (!response.ok || typeof data.content !== 'string') throw new Error(data.message || '切换失败');
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: data.content!, selected: data.index ?? index } : item)));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSwitching(null);
    }
  }, []);

  const branch = useCallback(
    async (message: ChatMessageView) => {
      if (typeof message.id !== 'number') return;
      try {
        const response = await fetch(`/api/chats/${chatId}/branch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: message.id }),
        });
        const data = (await response.json().catch(() => ({}))) as { chatId?: number; message?: string };
        if (!response.ok || !data.chatId) throw new Error(data.message || '分支失败');
        router.push(`/chats/${data.chatId}?from=${chatId}&at=${message.id}`);
      } catch (caught) {
        setError((caught as Error).message);
      }
    },
    [chatId, router],
  );

  const toggleBookmark = useCallback(async (message: ChatMessageView) => {
    if (typeof message.id !== 'number') return;
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmark: !message.bookmark }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: { bookmark: boolean }; messageText?: string };
      if (!response.ok || !data.message) throw new Error('保存失败');
      const bookmark = data.message.bookmark;
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, bookmark } : item)));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  const speak = useCallback(async (message: ChatMessageView) => {
    if (typeof message.id !== 'number') return;
    setError('');
    try {
      const response = await fetch(`/api/messages/${message.id}/tts`, { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { message?: { attachment: ChatAttachmentView | null }; messageText?: string };
      if (!response.ok || !data.message) throw new Error((data as { message?: string }).message || '语音合成失败');
      const attachment = data.message.attachment;
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, attachment } : item)));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  const makeImage = useCallback(async () => {
    const prompt = imagePrompt.trim();
    if (!prompt) return;
    setImageBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/chats/${chatId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message || '生图失败');
      setImageOpen(false);
      setImagePrompt('');
      await resync();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setImageBusy(false);
    }
  }, [chatId, imagePrompt, resync]);

  const copy = useCallback(async (message: ChatMessageView) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setTimeout(() => setCopied((current) => (current === message.id ? null : current)), 1200);
    } catch {
      setError('复制失败，请手动选中文本');
    }
  }, []);

  return (
    <>
      <div className="p-chat-scroll" ref={scrollRef}>
        <div className="p-chat-col">
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
              <button className="p-btn p-btn--sm" type="button" disabled={loadingOlder} onClick={() => void loadOlder()}>
                {loadingOlder ? '加载中…' : '加载更早消息'}
              </button>
            </div>
          )}
          <section className={`p-rp-prologue${characterCover ? ' has-cover' : ''}`} style={{ ['--h' as string]: characterHue }}>
            {characterCover && <img className="rd-prologue-bg" src={characterCover} alt="" aria-hidden="true" />}
            <div className="rd-prologue-in">
              <div className="p-eyebrow">STORY · {characterName}</div>
              <h1>{title ?? '故事'}</h1>
              <p>你以「{personaName ?? '你'}」的身份进入这段故事</p>
              <small>开场</small>
            </div>
          </section>
          {messages.map((message, index) => {
            const isUser = message.role === 'user';
            const isLatest = index === messages.length - 1;
            const numericId = typeof message.id === 'number' ? message.id : null;
            const isEditing = editing !== null && editing.id === message.id;
            const isStreamingThis = streamingId === message.id;
            return (
              <article
                key={message.id}
                id={`msg-${message.id}`}
                className={`p-msg${isUser ? ' p-msg-user' : ''}${openActions === message.id ? ' is-tools-open' : ''}${isLatest ? ' is-latest' : ''}${isStreamingThis ? ' is-streaming' : ''}`}
                onTouchStart={!isUser && isLatest ? (event) => { const t = event.touches[0]; swipeStart.current = { x: t.clientX, y: t.clientY }; } : undefined}
                onTouchEnd={!isUser && isLatest ? (event) => {
                  // 手机端左右滑动最新回复：右滑看上一版，左滑看下一版 / 生成新版
                  const start = swipeStart.current; swipeStart.current = null;
                  if (!start || streaming || editing || numericId === null || !message.content) return;
                  const t = event.changedTouches[0];
                  const dx = t.clientX - start.x; const dy = t.clientY - start.y;
                  if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
                  if (dx > 0 && message.selected > 0) void switchCandidate(message, message.selected - 1);
                  else if (dx < 0) void (message.selected < message.candidateCount - 1 ? switchCandidate(message, message.selected + 1) : regenerate(message));
                } : undefined}
              >
                <span className={`p-avatar${!isUser && characterCover ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '32px', ['--h' as string]: isUser ? 28 : characterHue }}>
                  {isUser ? (personaName ? Array.from(personaName)[0] : '你') : characterCover ? <img src={characterCover} alt="" /> : Array.from(characterName)[0]}
                </span>
                <div>
                  <div className="p-msg-name"><span className="p-msg-who">{isUser ? (personaName || '你') : characterName}</span><MsgTime at={message.createdAt} /></div>
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
                      {message.attachment?.kind === 'image' ? (
                        <figure style={{ margin: '4px 0 0' }}>
                          <img
                            src={message.attachment.url}
                            alt={message.attachment.prompt ?? '生成的图片'}
                            style={{ display: 'block', width: '100%', maxWidth: 420, borderRadius: 12, border: '1px solid var(--border)' }}
                          />
                          {message.attachment.prompt && <figcaption className="p-small" style={{ marginTop: 6 }}>{message.attachment.prompt}</figcaption>}
                        </figure>
                      ) : (
                        <div className="p-msg-copy p-msg-text">
                          {message.content
                            ? <RpText text={message.content} streaming={isStreamingThis} />
                            : isStreamingThis ? <TypingDots label={`${characterName}正在构思`} /> : null}
                        </div>
                      )}
                      {message.attachment?.kind === 'audio' && (
                        <audio controls src={message.attachment.url} style={{ display: 'block', width: '100%', maxWidth: 360, marginTop: 8 }} />
                      )}
                    </>
                  )}
                  {!isEditing && !isUser && isLatest && numericId !== null && !isStreamingThis && message.content && (
                    <div className="rp-swipe" role="group" aria-label="回复版本">
                      <button type="button" aria-label="上一版回复" disabled={message.selected <= 0 || switching === numericId || streaming} onClick={() => void switchCandidate(message, message.selected - 1)}><Ico name="prev" /></button>
                      <span className="rp-swipe-index" aria-live="polite">{Math.max(1, message.selected + 1)} / {Math.max(1, message.candidateCount)}</span>
                      {message.selected < message.candidateCount - 1 ? (
                        <button type="button" aria-label="下一版回复" disabled={switching === numericId || streaming} onClick={() => void switchCandidate(message, message.selected + 1)}><Ico name="next" /></button>
                      ) : (
                        <button type="button" className="rp-swipe-new" aria-label="生成新的一版" title="生成新的一版" disabled={streaming} onClick={() => void regenerate(message)}><Ico name="next" /></button>
                      )}
                    </div>
                  )}
                  {!isEditing && (
                    <button className="p-msg-more" type="button" aria-label="消息操作" aria-expanded={openActions === message.id} onClick={() => setOpenActions(openActions === message.id ? null : message.id)}>⋯</button>
                  )}
                  {!isEditing && (
                    <div className="p-msg-tools">
                      {confirming !== null && confirming === numericId ? (
                        <>
                          <button type="button" aria-label="确认删除" title="确认删除" onClick={() => void remove(confirming)}><Ico name="check" /></button>
                          <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirming(null)}><Ico name="x" /></button>
                        </>
                      ) : (
                        <>
                          {!isUser && message.candidateCount > 1 && (
                            <span className="p-rp-candidate">
                              <button type="button" aria-label="上一个候选" disabled={message.selected <= 0 || switching === numericId} onClick={() => void switchCandidate(message, message.selected - 1)}><Ico name="prev" /></button>
                              <span className="p-rp-candidate-index">{message.selected + 1}/{message.candidateCount}</span>
                              <button type="button" aria-label="下一个候选" disabled={message.selected >= message.candidateCount - 1 || switching === numericId} onClick={() => void switchCandidate(message, message.selected + 1)}><Ico name="next" /></button>
                            </span>
                          )}
                          <button type="button" aria-label="复制消息" title="复制消息" onClick={() => void copy(message)}>{copied === message.id ? <Ico name="check" /> : <Ico name="copy" />}</button>
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="编辑消息" title="编辑消息" onClick={() => setEditing({ id: numericId, draft: message.content })}><Ico name="edit" /></button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && media?.tts && (
                            <button type="button" aria-label="朗读" title="朗读" onClick={() => void speak(message)}><Ico name="play" /></button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" data-act="bookmark" aria-label="书签" title="书签" aria-pressed={message.bookmark === true} onClick={() => void toggleBookmark(message)}><Ico name="star" /></button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && (
                            <button type="button" data-act="regen" aria-label="重新生成" title="重新生成" disabled={streaming} onClick={() => void regenerate(message)}><Ico name="regen" /></button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" data-act="branch" aria-label="从这里创建分支" title="分支" onClick={() => void branch(message)}><Ico name="branch" /></button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="删除消息" title="删除" onClick={() => setConfirming(numericId)}><Ico name="x" /></button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && (
                            <ReportButton targetType="message" targetId={numericId} className="p-msg-tool" label="举报" icon={<Ico name="flag" />} />
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          <div ref={bottomRef} style={{ scrollMarginBottom: 120 }} />
        </div>
      </div>


      <div className="p-chat-compose">
        <div className="p-chat-col">
          <button
            type="button"
            className={`rd-jump${awayFromBottom ? ' is-visible' : ''}`}
            onClick={jumpToLatest}
            aria-label={unseen ? `回到最新，${unseen} 条新消息` : '回到最新'}
            tabIndex={awayFromBottom ? 0 : -1}
          >
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            <span>{unseen ? `${unseen} 条新消息` : '回到最新'}</span>
          </button>
          {error && (
            <div role="alert" className="p-form-error" style={{ margin: '0 0 8px' }}>
              <div>{friendlyError(error)}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {failed && (
                  <button className="p-btn p-btn--sm" type="button" onClick={() => { const action = failed; setFailed(null); setError(''); if (action.type === 'send') void send(); else void regenerate(action.message); }}>重试</button>
                )}
                {/点数不足|402/.test(error) && (
                  <>
                    <Link className="p-btn p-btn--sm p-btn--primary" href="/me/points">签到领点</Link>
                    <Link className="p-btn p-btn--sm" href="/me/points">兑换码 / 充值</Link>
                  </>
                )}
              </div>
            </div>
          )}
          {media?.image && (
            <div style={{ marginBottom: 8 }}>
              <button className="p-text-btn" type="button" onClick={() => setImageOpen(true)}>生图</button>
            </div>
          )}
          {quickReplies.length > 0 && (
            <div className="p-chat-quick">
              {quickReplies.map((reply) => (
                <button
                  key={`${reply.label}-${reply.content}`}
                  className="p-chip"
                  type="button"
                  title={reply.content}
                  onClick={() => setDraft((current) => (current ? `${current}\n${reply.content}` : reply.content))}
                >
                  {reply.label}
                </button>
              ))}
            </div>
          )}
          <NewbieTip />
          {preview && draft.trim() && !streaming && (
            <div className="p-chat-preview" aria-live="polite">
              <span className="p-chat-preview-k">预览</span>
              <div className="p-msg-copy"><RpText text={draft} /></div>
            </div>
          )}
          <div className="p-chat-compose-row">
            <textarea
              ref={inputRef}
              className="p-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder="写下台词，或用 *行动描述* 推进故事…"
              aria-label="消息"
            />
            {streaming ? (
              <button className="p-chat-send is-stop" type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成"><span className="rd-stop" aria-hidden="true" /></button>
            ) : (
              <button className="p-chat-send" type="button" onClick={() => void send()} disabled={!draft.trim()} aria-label="发送">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            )}
          </div>
          <div className="p-chat-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 0' }}>
            <span className="p-chat-acts">
              <button className="p-chat-continue p-chat-act" type="button" disabled={streaming || impersonating || messages.length === 0} onClick={() => void send('*继续*')} title="不写台词，让角色把这一幕继续演下去">▸ 继续</button>
              <button className="p-chat-act p-chat-imp" type="button" disabled={streaming || impersonating} onClick={() => void impersonate()} title="让 AI 以你的身份写一句（输入框里的字会当作方向提示），写完可以再改">{impersonating ? '代写中…' : '✎ 代写'}</button>
              <button className="p-chat-act p-chat-pv" type="button" aria-pressed={preview} onClick={togglePreview} title="在输入框上方按 RP 排版预览：*动作*、「对白」、((场外))">{preview ? '◉' : '◎'} 预览</button>
              <ModelPicker chatId={chatId} />
            </span>
            <span className="p-small p-chat-hint">Enter 发送 · Shift + Enter 换行 · 回复由模型生成，可能出错</span>
            {billing && <span className="p-small">本回合 -{billing.cost} 点{billing.free ? `（免费额度抵扣 ${billing.free}）` : ''} · 余额 {billing.balance}</span>}
          </div>
        </div>
      </div>

      {imageOpen && (
        <Modal
          title="生成一张插图"
          onClose={() => setImageOpen(false)}
          footer={
            <>
              <button className="btn btn--sm" type="button" onClick={() => setImageOpen(false)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={imageBusy || !imagePrompt.trim()} onClick={() => void makeImage()}>
                {imageBusy ? '生成中…' : '生成'}
              </button>
            </>
          }
        >
          <div className="field">
            <label>画面描述</label>
            <textarea
              className="textarea"
              rows={4}
              value={imagePrompt}
              placeholder="例如：民国报馆的雨夜，暖黄台灯下两个人对坐，窗外雨幕"
              onChange={(event) => setImagePrompt(event.target.value)}
            />
          </div>
          <p className="small" style={{ margin: 0 }}>会消耗 {media?.imageCost ?? 0} 点，生成后作为一条消息插入对话。</p>
        </Modal>
      )}
    </>
  );
}
