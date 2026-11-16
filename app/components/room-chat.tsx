'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RpText, TypingDots } from '@/components/rp-text';
import { ModelPicker } from '@/components/model-picker';

type RoomMessageView = { id: number | string; role: 'user' | 'assistant'; speakerId: string | null; content: string };
type Member = { id: string; name: string; initial: string; hue: number; muted?: boolean };

type Props = {
  roomId: number;
  strategy: string;
  members: Member[];
  initialMessages: RoomMessageView[];
  userName: string;
  autoMode?: boolean;
  defaultSpeakerId?: string | null;
};

const STRATEGY_HINT: Record<string, string> = {
  natural: '自然：你叫到谁的名字，谁就先答；否则轮流。',
  roundRobin: '轮流：发言次数最少的角色先答。',
  manual: '手动：你自己选本轮由谁回应。',
  pooled: '随机：每轮从成员里抽一个。',
};

export function RoomChat({ roomId, strategy, members, initialMessages, userName, autoMode = false, defaultSpeakerId }: Props) {
  const [messages, setMessages] = useState<RoomMessageView[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [speakerId, setSpeakerId] = useState(defaultSpeakerId && members.some((member) => member.id === defaultSpeakerId) ? defaultSpeakerId : members[0]?.id ?? '');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const memberOf = (id: string | null) => members.find((member) => member.id === id);

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

  // 生成一条回复（auto=true 时不再写入玩家消息，用于自动推进）
  const streamReply = useCallback(async (options: { text: string; auto: boolean }) => {
    const stamp = Date.now();
    const streamKey = `stream-${stamp}`;
    if (!options.auto) {
      setMessages((prev) => [...prev, { id: `local-${stamp}`, role: 'user', speakerId: null, content: options.text }]);
    }
    setMessages((prev) => [...prev, { id: streamKey, role: 'assistant', speakerId: null, content: '' }]);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    let completed = false;
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: options.text, auto: options.auto, speakerId: strategy === 'manual' ? speakerId : undefined }),
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
          let event: { type: string; text?: string; message?: string; messageId?: number; speakerId?: string; name?: string; content?: string };
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (event.type === 'speaker') {
            setTyping(event.name ?? null);
            setMessages((prev) => prev.map((item) => (item.id === streamKey ? { ...item, speakerId: event.speakerId ?? null } : item)));
          } else if (event.type === 'delta' && event.text) {
            full += event.text;
            setMessages((prev) => prev.map((item) => (item.id === streamKey ? { ...item, content: full } : item)));
          } else if (event.type === 'done') {
            completed = true;
            setMessages((prev) =>
              prev.map((item) =>
                item.id === streamKey
                  ? { ...item, id: event.messageId ?? item.id, content: event.content ?? full, speakerId: event.speakerId ?? item.speakerId }
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
    } finally {
      setTyping(null);
      abortRef.current = null;
      if (!completed) await new Promise((resolve) => setTimeout(resolve, 400));
      await resync();
    }
    return completed;
  }, [roomId, speakerId, strategy, resync]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    setError('');
    setStreaming(true);
    try {
      const ok = await streamReply({ text, auto: false });
      // 自动推进：首轮回应后，再让最多两位成员接话
      if (ok && autoMode) {
        for (let index = 0; index < 2; index += 1) {
          const next = await streamReply({ text: '', auto: true });
          if (!next) break;
        }
      }
    } finally {
      setStreaming(false);
      setTyping(null);
    }
  }, [draft, streaming, streamReply, autoMode]);

  return (
    <>
      <div className="p-chat-scroll">
        <div className="p-chat-col">
          {messages.map((message, index) => {
            const member = memberOf(message.speakerId);
            const isUser = message.role === 'user';
            const isLast = index === messages.length - 1;
            return (
              <article key={message.id} className={`p-msg${isUser ? ' p-msg-user' : ''}${isLast ? ' is-latest' : ''}${isLast && streaming && !isUser ? ' is-streaming' : ''}`}>
                <span className="p-avatar" style={{ ['--size' as string]: '32px', ['--h' as string]: isUser ? 28 : member?.hue ?? 212 }}>
                  {isUser ? '你' : member?.initial ?? '·'}
                </span>
                <div>
                  <div className="p-msg-name">{isUser ? userName : member?.name ?? '角色'}</div>
                  <div className="p-msg-copy p-msg-text">
                    {message.content
                      ? <RpText text={message.content} streaming={isLast && streaming && !isUser} />
                      : streaming ? <TypingDots label={`${member?.name ?? '角色'}正在构思`} /> : null}
                  </div>
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
            {strategy === 'manual' && (
              <label className="p-small" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                本轮由
                <select className="p-select" style={{ width: 'auto', padding: '4px 8px' }} value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
                  {members.filter((member) => !member.muted).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
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
                  void send();
                }
              }}
              rows={1}
              placeholder="说点什么，或者叫某个角色的名字…"
              aria-label="消息"
            />
            {streaming ? (
              <button className="p-chat-send" type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成">■</button>
            ) : (
              <button className="p-chat-send" type="button" onClick={() => void send()} disabled={!draft.trim()} aria-label="发送">↑</button>
            )}
          </div>
          <div className="p-compose-meta">
            <span className="p-chat-acts"><ModelPicker roomId={roomId} /></span>
            <span>Enter 发送 · Shift + Enter 换行 · 群聊回复由模型生成</span>
          </div>
        </div>
      </div>
    </>
  );
}
