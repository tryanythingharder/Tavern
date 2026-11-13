'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/settings-ui';
import { ReportButton } from '@/components/report-button';

export type ChatAttachmentView = { kind: 'image' | 'audio'; url: string; prompt?: string; createdAt: number };

export type ChatMessageView = {
  id: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  candidateCount: number;
  selected: number;
  bookmark?: boolean;
  attachment?: ChatAttachmentView | null;
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
};

type StreamEvent = {
  type: string;
  text?: string;
  message?: string;
  messageId?: number | null;
  content?: string;
  candidateIndex?: number;
  candidateCount?: number;
  cost?: number;
  balance?: number;
};

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
export function ChatRoom({ chatId, characterName, initialMessages, initialHasMore = false, quickReplies = [], media, title, personaName }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<{ type: 'send' } | { type: 'regen'; message: ChatMessageView } | null>(null);
  const [billing, setBilling] = useState<{ cost: number; balance: number } | null>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [openActions, setOpenActions] = useState<number | string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prependingRef = useRef(false);

  useEffect(() => {
    // 加载更早消息时保持当前阅读位置，不要跳到底部
    if (prependingRef.current) {
      prependingRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: 'end' });
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
              if (typeof event.cost === 'number' && typeof event.balance === 'number') setBilling({ cost: event.cost, balance: event.balance });
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

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    const stamp = Date.now();
    const assistantKey = `local-assistant-${stamp}`;
    setMessages((prev) => [
      ...prev,
      { id: `local-user-${stamp}`, role: 'user', content: text, candidateCount: 0, selected: 0 },
      { id: assistantKey, role: 'assistant', content: '', candidateCount: 0, selected: 0 },
    ]);
    // 被限流/失败时不吞掉用户输入：请求没被接受就把草稿放回去
    const accepted = await streamInto(`/api/chats/${chatId}/messages`, { text }, assistantKey, () => setDraft(''));
    if (!accepted) {
      // 请求未被接受：撤掉本地乐观消息，避免留下空气泡
      setMessages((prev) => prev.filter((item) => item.id !== assistantKey && item.id !== `local-user-${stamp}`));
      setDraft((current) => (current ? current : text));
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
          <section className="p-rp-prologue">
            <div className="p-eyebrow">STORY</div>
            <h1>{title ?? '故事'}</h1>
            <p>当前身份 · {personaName ?? '你'}</p>
            <small>开场</small>
          </section>
          {messages.map((message) => {
            const isUser = message.role === 'user';
            const numericId = typeof message.id === 'number' ? message.id : null;
            const isEditing = editing !== null && editing.id === message.id;
            const isStreamingThis = streamingId === message.id;
            return (
              <article key={message.id} id={`msg-${message.id}`} className={`p-msg${isUser ? ' p-msg-user' : ''}${openActions === message.id ? ' is-tools-open' : ''}`}>
                <span className="p-avatar" style={{ ['--size' as string]: '32px', ['--h' as string]: isUser ? 28 : 212 }}>
                  {isUser ? '你' : Array.from(characterName)[0]}
                </span>
                <div>
                  <div className="p-msg-name">{isUser ? '你' : characterName}</div>
                  {isEditing ? (
                    <div>
                      <textarea
                        className="p-textarea"
                        value={editing.draft}
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
                        <div className="p-msg-copy p-msg-text">{message.content || (isStreamingThis ? '…' : '')}</div>
                      )}
                      {message.attachment?.kind === 'audio' && (
                        <audio controls src={message.attachment.url} style={{ display: 'block', width: '100%', maxWidth: 360, marginTop: 8 }} />
                      )}
                    </>
                  )}
                  {!isEditing && (
                    <button className="p-msg-more" type="button" aria-label="消息操作" aria-expanded={openActions === message.id} onClick={() => setOpenActions(openActions === message.id ? null : message.id)}>⋯</button>
                  )}
                  {!isEditing && (
                    <div className="p-msg-tools">
                      {confirming !== null && confirming === numericId ? (
                        <>
                          <button type="button" aria-label="确认删除" title="确认删除" onClick={() => void remove(confirming)}>✓</button>
                          <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirming(null)}>✕</button>
                        </>
                      ) : (
                        <>
                          {!isUser && message.candidateCount > 1 && (
                            <span className="p-rp-candidate">
                              <button type="button" aria-label="上一个候选" disabled={message.selected <= 0 || switching === numericId} onClick={() => void switchCandidate(message, message.selected - 1)}>‹</button>
                              <span className="p-rp-candidate-index">{message.selected + 1}/{message.candidateCount}</span>
                              <button type="button" aria-label="下一个候选" disabled={message.selected >= message.candidateCount - 1 || switching === numericId} onClick={() => void switchCandidate(message, message.selected + 1)}>›</button>
                            </span>
                          )}
                          <button type="button" aria-label="复制消息" title="复制消息" onClick={() => void copy(message)}>{copied === message.id ? '✓' : '⧉'}</button>
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="编辑消息" title="编辑消息" onClick={() => setEditing({ id: numericId, draft: message.content })}>✎</button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && media?.tts && (
                            <button type="button" aria-label="朗读" title="朗读" onClick={() => void speak(message)}>▶</button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="书签" title="书签" aria-pressed={message.bookmark === true} onClick={() => void toggleBookmark(message)}>★</button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="重新生成" title="重新生成" disabled={streaming} onClick={() => void regenerate(message)}>↻</button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="从这里创建分支" title="分支" onClick={() => void branch(message)}>⑂</button>
                          )}
                          {numericId !== null && !isStreamingThis && (
                            <button type="button" aria-label="删除消息" title="删除" onClick={() => setConfirming(numericId)}>✕</button>
                          )}
                          {!isUser && numericId !== null && !isStreamingThis && (
                            <ReportButton targetType="message" targetId={numericId} className="p-msg-tool" />
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
              placeholder="写下台词，或用 *行动描述* 推进故事…"
              aria-label="消息"
            />
            {streaming ? (
              <button className="p-chat-send" type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成">■</button>
            ) : (
              <button className="p-chat-send" type="button" onClick={() => void send()} disabled={!draft.trim()} aria-label="发送">↑</button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', margin: '6px 0 0' }}>
            <span className="p-small">Enter 发送 · Shift + Enter 换行 · 回复由模型生成，可能出错</span>
            {billing && <span className="p-small">本回合 -{billing.cost} 点 · 余额 {billing.balance}</span>}
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
