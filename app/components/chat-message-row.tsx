'use client';

import { useEffect, useState } from 'react';
import type React from 'react';
import { ThoughtBlock } from '@/components/thought-block';
import { ReportButton } from '@/components/report-button';
import { TypingDots } from '@/components/rp-text';
import { RichText } from '@/components/rich-text';
import { UserAvatar } from '@/components/persona-switch';
import { langLabel as langName } from '@/lib/translation';
import type { RegexRule } from '@/lib/resources';
import type { RegexMacros } from '@/lib/regex-apply';
import type { ChatMessageView, ChatRoomMedia, RowActions, EditingState } from '@/components/chat-room';

// 对话页的一楼消息（从 chat-room.tsx 拆出）。父组件按「会影响这一楼的值」缓存元素，没变就复用，
// 所以这里不放 hook；事件处理一律通过 L 读最新的函数和状态。

const ICONS = {"copy": "M9 9h10v10H9zM5 15V5h10", "check": "m5 12 5 5 9-10", "edit": "M4 20h4L19 9l-4-4L4 16zM13 7l4 4", "play": "M8 5v14l11-7z", "star": "m12 4 2.5 5.2 5.5.7-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.7z", "regen": "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5", "branch": "M6 4v10M6 14a4 4 0 0 0 4 4h4M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 8v2a4 4 0 0 1-4 4H6", "x": "M6 6l12 12M18 6 6 18", "prev": "m15 6-6 6 6 6", "next": "m9 6 6 6-6 6", "flag": "M5 21V4M5 4h11l-2 4 2 4H5", "checkpoint": "M7 4h10v16l-5-3.5L7 20z", "ghost": "M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11h.01M14 11h.01", "translate": "M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5", "portrait": "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0", "cut": "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7.5 20 19M8.5 16.5 20 5"} as const;
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

export type MessageRowProps = {
  message: ChatMessageView;
  index: number;
  total: number;
  offset: number;
  hasMore: boolean;
  editing: EditingState;
  setEditing: (value: EditingState) => void;
  streaming: boolean;
  streamingId: number | string | null;
  flipped: Set<number | string>;
  setFlipped: React.Dispatch<React.SetStateAction<Set<number | string>>>;
  openActions: number | string | null;
  setOpenActions: (value: number | string | null) => void;
  swipeStart: React.MutableRefObject<{ x: number; y: number } | null>;
  L: RowActions;
  personaName: string;
  personaAvatar: string | null | undefined;
  accountAvatar: string | null;
  characterCover: string | null;
  characterHue: number;
  characterName: string;
  thoughtsOpen: boolean;
  displayRules: RegexRule[];
  displayMacros: RegexMacros;
  chatId: number;
  mvuRev: Map<number, string>;
  translating: number | null;
  media: ChatRoomMedia | undefined;
  lookUrl: string | null;
  imageBusy: boolean;
  switching: number | null;
  confirming: number | null;
  setConfirming: (value: number | null) => void;
  confirmingFrom: number | null;
  setConfirmingFrom: (value: number | null) => void;
  copied: number | string | null;
  setImageMode: (value: 'scene' | 'last' | 'character' | 'custom') => void;
  setImagePrompt: (value: string) => void;
  setImageOpen: (value: boolean) => void;
};

export function MessageRow({ message, index, total, offset, hasMore, editing, setEditing, streaming, streamingId, flipped, setFlipped, openActions, setOpenActions, swipeStart, L, personaName, personaAvatar, accountAvatar, characterCover, characterHue, characterName, thoughtsOpen, displayRules, displayMacros, chatId, mvuRev, translating, media, lookUrl, imageBusy, switching, confirming, setConfirming, confirmingFrom, setConfirmingFrom, copied, setImageMode, setImagePrompt, setImageOpen }: MessageRowProps) {
            const isUser = message.role === 'user';
        const isNarrator = message.role === 'system';
        const floor = offset + index;
        const metaText = message.meta ? `${message.meta.tokens} tokens · ${(message.meta.ms / 1000).toFixed(1)}s` : '';
        const isLatest = index === total - 1;
        // ST：第一条开场白只能在备选开场白之间切换，不生成新版
        const isGreeting = !hasMore && index === 0 && !isUser;
        // 插图消息：没有「回复版本」，重新生成=按同一段画面描述再画一张
        const isImage = message.attachment?.kind === 'image';
        const numericId = typeof message.id === 'number' ? message.id : null;
        const isEditing = editing !== null && editing.id === message.id;
        const isStreamingThis = streamingId === message.id;
        // 有译文时默认显示译文（玩家输入翻译：默认显示原话），点切换后显示另一面
        const showTr = Boolean(message.translation) && !isStreamingThis && !flipped.has(message.id);
        const shownText = showTr && message.translation ? message.translation.text : message.content;
        return (
          <article
            key={message.id}
            id={`msg-${message.id}`}
            className={`p-msg${isUser ? ' p-msg-user' : ''}${isNarrator ? ' p-msg-narrator' : ''}${message.hidden ? ' is-hidden' : ''}${openActions === message.id ? ' is-tools-open' : ''}${isLatest ? ' is-latest' : ''}${isStreamingThis ? ' is-streaming' : ''}`}
            onTouchStart={!isUser && isLatest ? (event) => { const t = event.touches[0]; swipeStart.current = { x: t.clientX, y: t.clientY }; } : undefined}
            onTouchEnd={!isUser && isLatest ? (event) => {
              // 手机端左右滑动最新回复：右滑看上一版，左滑看下一版 / 生成新版
              const start = swipeStart.current; swipeStart.current = null;
              if (!start || L.streaming || L.editing || numericId === null || !message.content) return;
              const t = event.changedTouches[0];
              const dx = t.clientX - start.x; const dy = t.clientY - start.y;
              if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
              if (dx > 0 && message.selected > 0) void L.switchCandidate(message, message.selected - 1);
              else if (dx < 0) void (message.selected < message.candidateCount - 1 ? L.switchCandidate(message, message.selected + 1) : isGreeting ? undefined : L.regenerate(message));
            } : undefined}
          >
            {isNarrator ? null : isUser ? (
              <UserAvatar name={message.personaName || personaName} avatar={(message.personaName ? message.personaAvatar : personaAvatar) || accountAvatar} />
            ) : (
              <span className={`p-avatar${characterCover ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '32px', ['--h' as string]: characterHue }}>
                {characterCover ? <img src={characterCover} alt="" /> : Array.from(characterName)[0]}
              </span>
            )}
            <div>
              <div className="p-msg-name">
                <span className="p-msg-who">{isNarrator ? '旁白' : isUser ? (message.personaName || personaName) : (message.personaName || characterName)}</span>
                <MsgTime at={message.createdAt} />
                {message.hidden && <span className="p-msg-ghost" title="已隐藏：这条不会发给模型"><Ico name="ghost" />已隐藏</span>}
              </div>
              {isEditing ? (
                <div>
                  {!isUser && editing.thought != null ? (
                    <div className="p-thought-edit">
                      <label className="p-small" htmlFor={`thought-${message.id}`}>思考内容</label>
                      <textarea
                        id={`thought-${message.id}`}
                        className="p-textarea"
                        value={editing.thought}
                        rows={Math.min(10, Math.max(2, editing.thought.split('\n').length + 1))}
                        placeholder="留空保存 = 删除思考内容"
                        onChange={(event) => setEditing({ ...editing, thought: event.target.value })}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEditing(null);
                          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void L.saveEdit(); }
                        }}
                      />
                    </div>
                  ) : null}
                  <textarea
                    className="p-textarea"
                    value={editing.draft}
                    rows={Math.min(16, Math.max(3, editing.draft.split('\n').length + 1))}
                    autoFocus
                    onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setEditing(null);
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void L.saveEdit();
                      }
                    }}
                    aria-label="编辑消息"
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!editing.draft.trim()} onClick={() => void L.saveEdit()}>保存</button>
                    <button className="p-btn p-btn--sm" type="button" onClick={() => setEditing(null)}>取消</button>
                    {!isUser && editing.thought == null ? (
                      <button className="p-btn p-btn--sm p-btn--ghost" type="button" onClick={() => setEditing({ ...editing, thought: '' })}>加思考内容</button>
                    ) : null}
                    {!isUser && editing.thought != null && message.thought?.t ? (
                      <button className="p-btn p-btn--sm p-btn--ghost" type="button" onClick={() => setEditing({ ...editing, thought: '' })}>清空思考</button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  {message.attachment?.kind === 'image' ? (
                    <figure className="p-msg-figure">
                      <img
                        className="p-msg-img"
                        src={message.attachment.url}
                        alt={message.attachment.prompt ?? '生成的图片'}
                        width={message.attachment.width}
                        height={message.attachment.height}
                        loading="lazy"
                        decoding="async"
                        style={message.attachment.width && message.attachment.height ? { aspectRatio: `auto ${message.attachment.width} / ${message.attachment.height}` } : undefined}
                      />
                      {media?.reference && lookUrl === message.attachment.url && <span className="p-msg-look">定妆照</span>}
                      {message.attachment.prompt && (
                        <details className="p-msg-imgprompt">
                          <summary>画面描述</summary>
                          <p>{message.attachment.prompt}</p>
                        </details>
                      )}
                    </figure>
                  ) : (
                    <>
                    {!isUser && message.thought?.t ? <ThoughtBlock thought={message.thought} live={isStreamingThis && !message.content} defaultOpen={thoughtsOpen} onEdit={(isLatest && streaming) || numericId === null ? undefined : () => setEditing({ id: numericId, draft: message.content, thought: message.thought?.t ?? '' })} /> : null}
                    <div className="p-msg-copy p-msg-text">
                      {message.content
                        ? <RichText text={shownText} streaming={isStreamingThis} rules={displayRules} macros={displayMacros} role={isUser ? 'user' : 'assistant'} depth={total - 1 - index} variables={!isUser && typeof message.id === 'number' && message.id > 0 ? { chatId, messageId: message.id, rev: mvuRev.get(message.id) } : undefined} />
                        : isStreamingThis ? <TypingDots label={`${characterName}正在构思`} /> : null}
                    </div>
                    {message.translation && numericId !== null && !isStreamingThis && (
                      <div className="p-msg-tr" role="group" aria-label="翻译">
                        <span className="p-msg-tr-tag">{message.translation.original ? (showTr ? '原话' : '发给模型的译文') : (showTr ? `译文 · ${langName(message.translation.lang)}` : '原文')}</span>
                        <button type="button" onClick={() => setFlipped((prev) => { const next = new Set(prev); if (next.has(message.id)) next.delete(message.id); else next.add(message.id); return next; })}>
                          {message.translation.original ? (showTr ? '看译文' : '看原话') : (showTr ? '看原文' : '看译文')}
                        </button>
                        {!message.translation.original && <button type="button" disabled={translating === numericId} onClick={() => void L.translateMessage(numericId)}>{translating === numericId ? '翻译中…' : '重新翻译'}</button>}
                        {!message.translation.original && <button type="button" onClick={() => void L.removeTranslation(numericId)}>移除</button>}
                      </div>
                    )}
                    {numericId !== null && translating === numericId && !message.translation && <div className="p-msg-tr"><span className="p-msg-tr-tag">翻译中…</span></div>}
                    </>
                  )}
                  {message.attachment?.kind === 'audio' && (
                    <audio controls src={message.attachment.url} style={{ display: 'block', width: '100%', maxWidth: 360, marginTop: 8 }} />
                  )}
                  {message.checkpoint ? (
                    <a className="p-msg-checkpoint" href={`/chats/${message.checkpoint}?from=${chatId}&at=${message.id}`}>
                      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checkpoint} /></svg>
                      <span>检查点</span>
                    </a>
                  ) : null}
                </>
              )}
              {!isEditing && !isUser && !isImage && isLatest && numericId !== null && !isStreamingThis && message.content && (
                <div className="rp-swipe" role="group" aria-label="回复版本">
                  <button type="button" aria-label="上一版回复" disabled={message.selected <= 0 || switching === numericId || streaming} onClick={() => void L.switchCandidate(message, message.selected - 1)}><Ico name="prev" /></button>
                  <span className="rp-swipe-index" aria-live="polite">{Math.max(1, message.selected + 1)} / {Math.max(1, message.candidateCount)}</span>
                  {message.selected < message.candidateCount - 1 ? (
                    <button type="button" aria-label="下一版回复" disabled={switching === numericId || streaming} onClick={() => void L.switchCandidate(message, message.selected + 1)}><Ico name="next" /></button>
                  ) : isGreeting ? (
                    <button type="button" aria-label="下一版回复" disabled><Ico name="next" /></button>
                  ) : (
                    <button type="button" className="rp-swipe-new" aria-label="生成新的一版" title="生成新的一版" disabled={streaming} onClick={() => void L.regenerate(message)}><Ico name="next" /></button>
                  )}
                </div>
              )}
              {!isUser && !isEditing && isLatest && !streaming && (message.cut ?? message.meta?.cut) && (
                <div className="p-msg-cut" role="note">
                  <span>回复到了长度上限，后面被截断了</span>
                  <button type="button" className="p-msg-cut-go" onClick={() => void L.continueLast()}>继续写完</button>
                </div>
              )}
              {!isEditing && (
                <button className="p-msg-more" type="button" aria-label="消息操作" aria-expanded={openActions === message.id} onClick={() => setOpenActions(openActions === message.id ? null : message.id)}>⋯</button>
              )}
              {!isEditing && (
                <div className="p-msg-tools">
                  {confirmingFrom !== null && confirmingFrom === numericId ? (
                    <>
                      <span className="p-msg-confirm">删除这条及之后的 {total - index} 条？</span>
                      <button type="button" aria-label="确认删除这条及之后的消息" title="确认删除" onClick={() => void L.removeFrom(confirmingFrom)}><Ico name="check" /></button>
                      <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirmingFrom(null)}><Ico name="x" /></button>
                    </>
                  ) : confirming !== null && confirming === numericId ? (
                    <>
                      <button type="button" aria-label="确认删除" title="确认删除" onClick={() => void L.remove(confirming)}><Ico name="check" /></button>
                      <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirming(null)}><Ico name="x" /></button>
                    </>
                  ) : (
                    <>
                      {!isUser && message.candidateCount > 1 && (
                        <span className="p-rp-candidate">
                          <button type="button" aria-label="上一个候选" disabled={message.selected <= 0 || switching === numericId} onClick={() => void L.switchCandidate(message, message.selected - 1)}><Ico name="prev" /></button>
                          <span className="p-rp-candidate-index">{message.selected + 1}/{message.candidateCount}</span>
                          <button type="button" aria-label="下一个候选" disabled={message.selected >= message.candidateCount - 1 || switching === numericId} onClick={() => void L.switchCandidate(message, message.selected + 1)}><Ico name="next" /></button>
                        </span>
                      )}
                      <button type="button" aria-label="复制消息" title="复制消息" onClick={() => void L.copy(message)}>{copied === message.id ? <Ico name="check" /> : <Ico name="copy" />}</button>
                      {!isImage && numericId !== null && !isStreamingThis && message.content && !message.translation && (
                        <button type="button" data-act="translate" aria-label="翻译" title="翻译" disabled={translating === numericId} onClick={() => void L.translateMessage(numericId)}><Ico name="translate" /></button>
                      )}
                      {!isImage && numericId !== null && !isStreamingThis && (
                        <button type="button" aria-label="编辑消息" title="编辑消息" onClick={() => setEditing({ id: numericId, draft: message.content, thought: !isUser && message.thought?.t ? message.thought.t : undefined })}><Ico name="edit" /></button>
                      )}
                      {!isUser && !isImage && numericId !== null && !isStreamingThis && media?.tts && (
                        <button type="button" aria-label="朗读" title="朗读" onClick={() => void L.speak(message)}><Ico name="play" /></button>
                      )}
                      {numericId !== null && !isStreamingThis && (
                        <button type="button" data-act="bookmark" aria-label="书签" title="书签" aria-pressed={message.bookmark === true} onClick={() => void L.toggleBookmark(message)}><Ico name="star" /></button>
                      )}
                      {isImage && media?.reference && numericId !== null && (
                        <button type="button" data-act="look" aria-label={lookUrl === message.attachment?.url ? '已是定妆照（点一下取消）' : '设为定妆照：以后生图照这张的长相画'} title={lookUrl === message.attachment?.url ? '定妆照' : '设为定妆照'} aria-pressed={lookUrl === message.attachment?.url} onClick={() => void L.toggleLook(message)}><Ico name="portrait" /></button>
                      )}
                      {!isUser && !isGreeting && numericId !== null && !isStreamingThis && (isImage ? (
                        <button type="button" data-act="regen" aria-label="按这段描述再画一张" title="再画一张" disabled={streaming || imageBusy} onClick={() => { setImageMode('custom'); setImagePrompt(message.attachment?.prompt ?? ''); setImageOpen(true); }}><Ico name="regen" /></button>
                      ) : (
                        <button type="button" data-act="regen" aria-label="重新生成" title="重新生成" disabled={isLatest && streaming} onClick={() => void L.regenerate(message)}><Ico name="regen" /></button>
                      ))}
                      {numericId !== null && !isStreamingThis && (
                        <button type="button" data-act="branch" aria-label="从这里创建分支" title="分支" onClick={() => void L.branch(message)}><Ico name="branch" /></button>
                      )}
                      {numericId !== null && !isStreamingThis && (
                        <button type="button" data-act="checkpoint" aria-label={message.checkpoint ? '打开检查点' : '在这里创建检查点'} title={message.checkpoint ? '打开检查点' : '检查点'} aria-pressed={Boolean(message.checkpoint)} onClick={() => void L.branch(message, true)}><Ico name="checkpoint" /></button>
                      )}
                      {numericId !== null && !isStreamingThis && (
                        <button type="button" data-act="hide" aria-label={message.hidden ? '取消隐藏' : '隐藏（不发给模型）'} title={message.hidden ? '取消隐藏' : '隐藏：不发给模型'} aria-pressed={message.hidden === true} onClick={() => void L.toggleHidden(message)}><Ico name="ghost" /></button>
                      )}
                      {numericId !== null && !isStreamingThis && (
                        <button type="button" aria-label="删除消息" title="删除" onClick={() => setConfirming(numericId)}><Ico name="x" /></button>
                      )}
                      {numericId !== null && !isStreamingThis && !isLatest && (
                        <button type="button" data-act="cut" aria-label="删除这条及之后的消息" title="删除这条及之后" onClick={() => setConfirmingFrom(numericId)}><Ico name="cut" /></button>
                      )}
                      {numericId !== null && (
                        <span className="p-msg-meta" title={message.meta ? `${message.meta.model} · ${metaText}` : `第 ${floor} 楼`}>#{floor}{message.meta ? ` · ${message.meta.model} · ${metaText}` : ''}</span>
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
}
