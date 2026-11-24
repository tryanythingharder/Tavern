'use client';

import type React from 'react';
import { ThoughtBlock, type ThoughtView } from '@/components/thought-block';
import { TypingDots } from '@/components/rp-text';
import { RichText } from '@/components/rich-text';
import { UserAvatar } from '@/components/persona-switch';
import { Ico, ICONS } from '@/components/msg-icons';
import { langLabel } from '@/lib/translation';
import type { RegexRule } from '@/lib/resources';

// 群聊的一楼消息（从 room-chat.tsx 拆出，结构同单聊的 chat-message-row.tsx）。父组件按「会影响这一楼的值」缓存元素，
// 没变就复用，所以这里不放 hook；事件处理一律通过 L 读最新的函数和状态。

export type RoomMessageView = { id: number | string; role: 'user' | 'assistant'; speakerId: string | null; content: string; candidateCount?: number; selected?: number; checkpoint?: number | null; personaName?: string | null; personaAvatar?: string | null; thought?: ThoughtView | null; translation?: { lang: string; text: string; original: boolean } | null; attachment?: { kind: 'image'; url: string; prompt?: string; mode?: string; width?: number; height?: number } | null };
export type RoomMember = { id: string; name: string; initial: string; hue: number; avatar?: string | null; muted?: boolean };
export type RoomMedia = { image: boolean; imageCost: number; reference: boolean; looks: Record<string, string | null>; hasImage: Record<string, boolean> };
export type RoomEditing = { id: number; draft: string; thought?: string | null } | null;
export type RoomGenMode = { kind: 'send'; text: string } | { kind: 'auto'; speakerId?: string } | { kind: 'regenerate' | 'continue'; messageId: number };

/** 楼层里的事件处理：父组件经代理给出最新的函数 */
export type RoomRowActions = {
  switchCandidate: (message: RoomMessageView, index: number) => Promise<void>;
  run: (mode: RoomGenMode) => Promise<void>;
  saveEdit: () => Promise<void>;
  translateMessage: (id: number, quiet?: boolean) => Promise<void>;
  removeTranslation: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  copy: (message: RoomMessageView) => Promise<void>;
  branch: (message: RoomMessageView, checkpoint?: boolean) => Promise<void>;
  toggleLook: (message: RoomMessageView) => Promise<void>;
  redraw: (message: RoomMessageView) => void;
};

export type RoomMessageRowProps = {
  message: RoomMessageView;
  index: number;
  total: number;
  firstUserIndex: number;
  members: RoomMember[];
  editing: RoomEditing;
  setEditing: (value: RoomEditing) => void;
  streaming: boolean;
  streamingId: number | string | null;
  flipped: Set<number | string>;
  setFlipped: React.Dispatch<React.SetStateAction<Set<number | string>>>;
  openActions: number | string | null;
  setOpenActions: (value: number | string | null) => void;
  swipeStart: React.MutableRefObject<{ x: number; y: number } | null>;
  L: RoomRowActions;
  userName: string;
  personaAvatar: string | null | undefined;
  accountAvatar: string | null;
  thoughtsOpen: boolean;
  rulesFor: (speakerId: string | null | undefined) => RegexRule[];
  macrosFor: (charName: string) => { char: string; user: string };
  roomId: number;
  mvuRev: Map<number, string>;
  translating: number | null;
  media: RoomMedia | undefined;
  looks: Record<string, string | null>;
  imageBusy: boolean;
  switching: number | null;
  confirming: number | null;
  setConfirming: (value: number | null) => void;
  copied: number | string | null;
};

export function RoomMessageRow({ message, index, total, firstUserIndex, members, editing, setEditing, streaming, streamingId, flipped, setFlipped, openActions, setOpenActions, swipeStart, L, userName, personaAvatar, accountAvatar, thoughtsOpen, rulesFor, macrosFor, roomId, mvuRev, translating, media, looks, imageBusy, switching, confirming, setConfirming, copied }: RoomMessageRowProps) {
        const member = members.find((item) => item.id === message.speakerId);
        const isUser = message.role === 'user';
        const isLast = index === total - 1;
        const numericId = typeof message.id === 'number' ? message.id : null;
        const isStreamingThis = streamingId === message.id || (isLast && streaming && !isUser && streamingId === null);
        const isEditing = editing !== null && editing.id === message.id;
        const count = message.candidateCount ?? 1;
        const selected = message.selected ?? 0;
        const isImage = message.attachment?.kind === 'image';
        const canSwipe = !isUser && !isImage && isLast && numericId !== null && !isStreamingThis && Boolean(message.content) && !isEditing;
        // 开场白（玩家还没说过话之前的角色消息）：只在备选开场白之间切换，不生成新版（同单聊 / ST）
        const isOpening = !isUser && index <= firstUserIndex;
        const showTr = Boolean(message.translation) && !isStreamingThis && !flipped.has(message.id);
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
              if (dx > 0 && selected > 0) void L.switchCandidate(message, selected - 1);
              else if (dx < 0 && selected < count - 1) void L.switchCandidate(message, selected + 1);
              else if (dx < 0 && !isOpening) void L.run({ kind: 'regenerate', messageId: numericId! });
            } : undefined}
          >
            {isUser ? (
              <UserAvatar name={message.personaName || userName} avatar={(message.personaName ? message.personaAvatar : personaAvatar) || accountAvatar} />
            ) : (
              <span className={`p-avatar${member?.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '32px', ['--h' as string]: member?.hue ?? 212 }}>
                {member?.avatar ? <img src={member.avatar} alt="" loading="lazy" /> : member?.initial ?? '·'}
              </span>
            )}
            <div>
              <div className="p-msg-name">{isUser ? message.personaName || userName : member?.name ?? '角色'}</div>
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
                  </div>
                </div>
              ) : (
                isImage && message.attachment ? (
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
                    {media?.reference && message.speakerId && looks[message.speakerId] === message.attachment.url && <span className="p-msg-look">定妆照</span>}
                    {message.attachment.prompt && (
                      <details className="p-msg-imgprompt">
                        <summary>画面描述</summary>
                        <p>{message.attachment.prompt}</p>
                      </details>
                    )}
                  </figure>
                ) : (
                <>
                  {!isUser && message.thought?.t ? <ThoughtBlock thought={message.thought} live={isStreamingThis && !message.content} defaultOpen={thoughtsOpen} onEdit={streaming || typeof message.id !== 'number' ? undefined : () => setEditing({ id: message.id as number, draft: message.content, thought: message.thought?.t ?? '' })} /> : null}
                  <div className="p-msg-copy p-msg-text">
                    {message.content
                      ? <RichText text={showTr && message.translation ? message.translation.text : message.content} streaming={isStreamingThis} rules={rulesFor(message.speakerId)} macros={macrosFor(member?.name ?? '')} role={isUser ? 'user' : 'assistant'} depth={total - 1 - index} variables={!isUser && numericId !== null && numericId > 0 ? { chatId: roomId, messageId: numericId, rev: mvuRev.get(numericId), room: true } : undefined} />
                      : isStreamingThis ? <TypingDots label={`${member?.name ?? '角色'}正在构思`} /> : null}
                  </div>
                  {message.translation && numericId !== null && !isStreamingThis && (
                    <div className="p-msg-tr" role="group" aria-label="翻译">
                      <span className="p-msg-tr-tag">{showTr ? `译文 · ${langLabel(message.translation.lang)}` : '原文'}</span>
                      <button type="button" onClick={() => setFlipped((prev) => { const next = new Set(prev); if (next.has(message.id)) next.delete(message.id); else next.add(message.id); return next; })}>{showTr ? '看原文' : '看译文'}</button>
                      <button type="button" disabled={translating === numericId} onClick={() => void L.translateMessage(numericId)}>{translating === numericId ? '翻译中…' : '重新翻译'}</button>
                      <button type="button" onClick={() => void L.removeTranslation(numericId)}>移除</button>
                    </div>
                  )}
                  {numericId !== null && translating === numericId && !message.translation && <div className="p-msg-tr"><span className="p-msg-tr-tag">翻译中…</span></div>}
                  {message.checkpoint ? (
                    <a className="p-msg-checkpoint" href={`/rooms/${message.checkpoint}`}>
                      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS.checkpoint} /></svg>
                      <span>检查点</span>
                    </a>
                  ) : null}
                </>
                )
              )}
              {canSwipe && !(isOpening && count <= 1) && (
                <div className="rp-swipe" role="group" aria-label="回复版本">
                  <button type="button" aria-label="上一版回复" disabled={selected <= 0 || switching === numericId || streaming} onClick={() => void L.switchCandidate(message, selected - 1)}><Ico name="prev" /></button>
                  <span className="rp-swipe-index" aria-live="polite">{selected + 1} / {count}</span>
                  {selected < count - 1 ? (
                    <button type="button" aria-label="下一版回复" disabled={switching === numericId || streaming} onClick={() => void L.switchCandidate(message, selected + 1)}><Ico name="next" /></button>
                  ) : isOpening ? (
                    <button type="button" aria-label="下一版回复" disabled><Ico name="next" /></button>
                  ) : (
                    <button type="button" className="rp-swipe-new" aria-label="生成新的一版" title="生成新的一版" disabled={streaming} onClick={() => void L.run({ kind: 'regenerate', messageId: numericId! })}><Ico name="next" /></button>
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
                      <button type="button" aria-label="确认删除" title="确认删除" onClick={() => void L.remove(numericId)}><Ico name="check" /></button>
                      <button type="button" aria-label="取消删除" title="取消" onClick={() => setConfirming(null)}><Ico name="x" /></button>
                    </>
                  ) : (
                    isImage ? (
                    <>
                      {media?.reference && message.speakerId && (
                        <button type="button" data-act="look" aria-label={looks[message.speakerId] === message.attachment?.url ? '已是定妆照（点一下取消）' : '设为定妆照：以后生图照这张的长相画'} title={looks[message.speakerId] === message.attachment?.url ? '定妆照' : '设为定妆照'} aria-pressed={looks[message.speakerId] === message.attachment?.url} onClick={() => void L.toggleLook(message)}><Ico name="portrait" /></button>
                      )}
                      {media?.image && (
                        <button type="button" data-act="regen" aria-label="按这段描述再画一张" title="再画一张" disabled={streaming || imageBusy} onClick={() => L.redraw(message)}><Ico name="regen" /></button>
                      )}
                      <button type="button" data-act="branch" aria-label="从这里创建分支" title="分支" disabled={streaming} onClick={() => void L.branch(message)}><Ico name="branch" /></button>
                      <button type="button" aria-label="删除消息" title="删除" disabled={streaming} onClick={() => setConfirming(numericId)}><Ico name="x" /></button>
                    </>
                    ) : (
                    <>
                      <button type="button" aria-label="复制消息" title="复制消息" onClick={() => void L.copy(message)}>{copied === message.id ? <Ico name="check" /> : <Ico name="copy" />}</button>
                      <button type="button" aria-label="编辑消息" title="编辑消息" disabled={streaming} onClick={() => setEditing({ id: numericId, draft: message.content, thought: !isUser && message.thought?.t ? message.thought.t : undefined })}><Ico name="edit" /></button>
                      {!isUser && isLast && !isOpening && (
                        <button type="button" data-act="regen" aria-label="重新生成" title="重新生成" disabled={streaming} onClick={() => void L.run({ kind: 'regenerate', messageId: numericId })}><Ico name="regen" /></button>
                      )}
                      {!message.translation && message.content && (
                        <button type="button" data-act="translate" aria-label="翻译" title="翻译" disabled={translating === numericId} onClick={() => void L.translateMessage(numericId)}><Ico name="translate" /></button>
                      )}
                      <button type="button" data-act="branch" aria-label="从这里创建分支" title="分支" disabled={streaming} onClick={() => void L.branch(message)}><Ico name="branch" /></button>
                      <button type="button" data-act="checkpoint" aria-label={message.checkpoint ? '打开检查点' : '在这里创建检查点'} title={message.checkpoint ? '打开检查点' : '检查点'} aria-pressed={Boolean(message.checkpoint)} disabled={streaming} onClick={() => void L.branch(message, true)}><Ico name="checkpoint" /></button>
                      <button type="button" aria-label="删除消息" title="删除" disabled={streaming} onClick={() => setConfirming(numericId)}><Ico name="x" /></button>
                    </>
                    )
                  )}
                </div>
              )}
            </div>
          </article>
        );
}
