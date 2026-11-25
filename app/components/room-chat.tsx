'use client';
import { fetchGenPrefs } from '@/lib/gen-prefs-client';
import { emitPoints } from '@/lib/points-bus';
import { readSse } from '@/lib/sse-client';
import { useRoomStream } from '@/components/use-room-stream';
import { useThoughtsOpen } from '@/components/thought-block';
import { RoomMessageRow, type RoomEditing, type RoomMember, type RoomMedia, type RoomMessageView, type RoomRowActions } from '@/components/room-message-row';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hasMvuCommands } from '@/lib/mvu-text';
import type { RegexRule } from '@/lib/resources';
import { RoomComposer } from '@/components/room-composer';
import type { PersonaCurrent, PersonaOption } from '@/components/persona-switch';
import { Select } from '@/components/ui-select';
import { activeQrSets, planQuickReply, type QrAuto, type QrItem, type QrSet, type QrState } from '@/lib/quick-replies';
import { useRouter } from 'next/navigation';
import { showAlert } from '@/components/ui-dialog';
import { ImageGenModal, type ImageMode } from '@/components/image-gen-modal';

type Member = RoomMember;

type Props = {
  /** 账号头像：身份没设头像时，玩家消息用它（只影响显示） */
  accountAvatar?: string | null;
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
  quickReplies?: QrState;
  /** 群聊生图：开关、单价、人物参考开关、各成员的定妆照与有没有自带图 */
  media?: RoomMedia;
};

const ROOM_IMAGE_MODES = [
  ['scene', '当前场景', '按最近几轮画出眼下的画面，最近出场的角色（最多 3 位）一起入画'],
  ['last', '最后一条回复', '把刚发言的角色那一幕画出来'],
  ['character', '角色立绘', '给选中的角色画一张人物像'],
  ['custom', '自己描述', '完全按你写的内容画'],
] as const;



const NO_RULES: RegexRule[] = [];
const NO_MEMBER_RULES: Record<string, RegexRule[]> = {};

export function RoomChat({ accountAvatar = null, roomId, strategy, members, initialMessages, userName: initialUserName, persona: personaInit, autoMode = false, defaultSpeakerId, displayRules = NO_RULES, memberRules = NO_MEMBER_RULES, quickReplies: qrInitial, media }: Props) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const [persona, setPersona] = useState<PersonaCurrent>(personaInit?.current ?? { id: null, name: initialUserName, avatar: null });
  const [personaLock, setPersonaLock] = useState<number | null>(personaInit?.lockedId ?? null);
  const userName = persona.name;
  // 每位发言者的显示正则与宏只算一次，消息组件才能跳过重画
  const rulesFor = useMemo(() => {
    const cache = new Map<string, RegexRule[]>();
    return (speakerId: string | null | undefined) => {
      const key = speakerId ?? '';
      let hit = cache.get(key);
      if (!hit) { hit = [...(speakerId ? memberRules[speakerId] ?? [] : []), ...displayRules]; cache.set(key, hit); }
      return hit;
    };
  }, [memberRules, displayRules]);
  const macrosFor = useMemo(() => {
    const cache = new Map<string, { char: string; user: string }>();
    return (charName: string) => {
      let hit = cache.get(charName);
      if (!hit) { hit = { char: charName, user: userName }; cache.set(charName, hit); }
      return hit;
    };
  }, [userName]);
  const [messages, setMessages] = useState<RoomMessageView[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [qr, setQr] = useState<QrState>(qrInitial ?? { sets: [], globalIds: [], scopeIds: [] });
  const qrRef = useRef(qr);
  qrRef.current = qr;
  const qrAutoRef = useRef<(kind: keyof QrAuto) => Promise<void>>(async () => {});
  const [error, setError] = useState('');
  const [speakerId, setSpeakerId] = useState(defaultSpeakerId && members.some((member) => member.id === defaultSpeakerId) ? defaultSpeakerId : members[0]?.id ?? '');
  const [openActions, setOpenActions] = useState<number | string | null>(null);
  const [editing, setEditing] = useState<RoomEditing>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const thoughtsOpen = useThoughtsOpen();
  // ---- 群聊生图（人物参考与单聊同一套，见 lib/image-ref.ts）----
  const [imageOpen, setImageOpen] = useState(false);
  const [imageMode, setImageMode] = useState<ImageMode>('scene');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageChar, setImageChar] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [looks, setLooks] = useState<Record<string, string | null>>(media?.looks ?? {});

  // ---- 消息翻译（ST Translate，同单聊）----
  const [translating, setTranslating] = useState<number | null>(null);
  // 默认显示译文；点「看原文」的消息记在这里
  const [flipped, setFlipped] = useState<Set<number | string>>(() => new Set());
  const autoTranslateRef = useRef(false);
  useEffect(() => {
    void fetchGenPrefs().then((prefs) => {
      const auto = prefs?.translate?.auto;
      autoTranslateRef.current = auto === 'responses' || auto === 'both';
    });
  }, []);
  const translateMessage = useCallback(async (id: number, quiet = false) => {
    setTranslating(id);
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages/${id}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = (await response.json().catch(() => ({}))) as { translation?: RoomMessageView['translation']; message?: string; cost?: number; balance?: number };
      if (!response.ok) throw new Error(data.message || '翻译失败');
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, translation: data.translation ?? null } : item)));
      setFlipped((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
      emitPoints(data);
    } catch (caught) {
      setError(`${quiet ? '自动翻译没成功：' : ''}${(caught as Error).message}`);
    } finally {
      setTranslating(null);
    }
  }, [roomId]);
  const removeTranslation = useCallback(async (id: number) => {
    await fetch(`/api/rooms/${roomId}/messages/${id}/translate`, { method: 'DELETE' }).catch(() => undefined);
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, translation: null } : item)));
  }, [roomId]);
  const translateRef = useRef(translateMessage);
  translateRef.current = translateMessage;
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // 流式片段合并到下一帧只滚一次（同单聊 chat-room.tsx）
  const followFrameRef = useRef(0);
  useEffect(() => {
    if (followFrameRef.current) return;
    followFrameRef.current = requestAnimationFrame(() => {
      followFrameRef.current = 0;
      bottomRef.current?.scrollIntoView({ block: 'end' });
    });
  }, [messages]);
  useEffect(() => () => { if (followFrameRef.current) cancelAnimationFrame(followFrameRef.current); }, []);

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
  const restoreDraft = useCallback((text: string) => setDraft((current) => (current.trim() ? current : text)), []);
  const { streaming, typing, streamingId, abortRef, run } = useRoomStream({ roomId, strategy, speakerId, autoMode, persona, setMessages, setError, setOpenActions, resync, qrAutoRef, autoTranslateRef, translateRef, restoreDraft });

  // 快捷回复：群聊里斜杠命令只支持 /trigger、/send、/setinput、/echo、/popup（其余在单聊里用）
  const runRef = useRef(run);
  runRef.current = run;
  const qrDepth = useRef(0);
  const qrMute = useRef(0);
  const runQuickReply = useCallback(async (set: QrSet, item: QrItem) => {
    if (qrDepth.current > 4) return;
    qrDepth.current += 1;
    const mute = item.preventAuto !== false;
    if (mute) qrMute.current += 1;
    try {
      const plan = planQuickReply(set, item.message, draftRef.current);
      if (plan.kind === 'input') {
        setDraft(plan.text);
        return;
      }
      if (plan.clearInput) setDraft('');
      if (plan.kind === 'send') {
        if (plan.text.trim()) await runRef.current({ kind: 'send', text: plan.text.trim() });
        return;
      }
      // 斜杠命令解析与背景命令按需加载（首屏不带）
      const [{ parseSlash }, { runBgCommand }] = await Promise.all([import('@/lib/slash'), import('@/lib/slash-media')]);
      for (const command of parseSlash(plan.text)) {
        if (command.name === 'trigger') await runRef.current({ kind: 'auto' });
        else if (command.name === 'send' && command.arg) await runRef.current({ kind: 'send', text: command.arg });
        else if (command.name === 'setinput') setDraft(command.arg);
        else if (command.name === 'echo' || command.name === 'popup') await showAlert(command.arg);
        else if (command.name === 'bg' || command.name === 'lockbg' || command.name === 'unlockbg') {
          const result = await runBgCommand('room', roomIdRef.current, command.name, command.arg);
          if (result.changed) routerRef.current.refresh();
        }
        else throw new Error(`群聊里暂不支持 /${command.name.replace(/^\?/, '')}，这条快捷回复请在单人聊天里用`);
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      qrDepth.current -= 1;
      if (mute) qrMute.current -= 1;
    }
  }, []);
  qrAutoRef.current = async (kind: keyof QrAuto) => {
    if (qrMute.current > 0) return;
    const list = activeQrSets(qrRef.current).filter((set) => set.replies.some((item) => item.auto[kind]));
    if (!list.length) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
    for (const set of activeQrSets(qrRef.current)) {
      for (const item of set.replies) if (item.auto[kind]) await runQuickReply(set, item);
    }
  };
  useEffect(() => {
    let first = false;
    try {
      first = !sessionStorage.getItem('tavern:qr-startup');
      sessionStorage.setItem('tavern:qr-startup', '1');
    } catch { /* 无痕模式 */ }
    void (async () => {
      if (first) await qrAutoRef.current('startup');
      await qrAutoRef.current('chatChange');
    })();
  }, [roomId]);

  // ST 成员列表的「让 TA 发言」：无视调度和静音，指定这位成员接着说一条
  const forceTalk = useCallback((memberId: string) => {
    void run({ kind: 'auto', speakerId: memberId });
  }, [run]);

  // ST「继续」：最后一条是角色消息就接着写；否则让下一位角色接话（同群聊里的「推进」）
  const continueLast = useCallback(() => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant' && typeof last.id === 'number' && !last.attachment) void run({ kind: 'continue', messageId: last.id });
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
        setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: updated.content, selected: updated.selected, candidateCount: updated.candidateCount, thought: updated.thought ?? null, translation: updated.translation ?? null } : item)));
      } else setError('切换失败');
    } finally {
      setSwitching(null);
    }
  }, [roomId]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const content = editing.draft.trim();
    if (!content) return;
    const response = await fetch(`/api/rooms/${roomId}/messages/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing.thought === undefined ? { content } : { content, reasoning: editing.thought ?? '' }) });
    const data = (await response.json().catch(() => ({}))) as { message?: string | RoomMessageView };
    if (!response.ok) {
      setError(typeof data.message === 'string' ? data.message : '保存失败');
      return;
    }
    const saved = typeof data.message === 'object' ? data.message : null;
    const touchedThought = editing.thought !== undefined;
    setMessages((prev) => prev.map((item) => (item.id === editing.id ? { ...item, content, ...(content !== item.content ? { translation: null } : {}), ...(touchedThought ? { thought: saved?.thought ?? null } : {}) } : item)));
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
      let text = '';
      await readSse<{ type: string; text?: string; message?: string }>(response.body, (event) => {
        try {
          if (event.type === 'delta' && event.text) { text += event.text; setDraft(text); }
          else if (event.type === 'done') { setDraft(event.text ?? text); emitPoints(event as { balance?: unknown; cost?: unknown }); }
          else if (event.type === 'error') setError(event.message ?? '代写失败');
        } catch {
          // 忽略坏行
        }
      });
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

  const lastSpeakerId = useMemo(() => [...messages].reverse().find((item) => item.role === 'assistant' && !item.attachment && item.speakerId)?.speakerId ?? null, [messages]);
  const imageFocus = imageChar || (imageMode === 'scene' || imageMode === 'last' ? lastSpeakerId : null) || members[0]?.id || '';

  const makeImage = useCallback(async () => {
    const prompt = imagePrompt.trim();
    if (imageMode === 'custom' && !prompt) return;
    setImageBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${roomId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: imageMode, characterId: imageChar || undefined, ...(imageMode === 'custom' ? { prompt } : { hint: prompt }) }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string; cost?: number; balance?: number };
      if (!response.ok) throw new Error(data.message || '生图失败');
      setImageOpen(false);
      setImagePrompt('');
      emitPoints(data);
      await resync();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setImageBusy(false);
    }
  }, [roomId, imagePrompt, imageMode, imageChar, resync]);

  const toggleLook = useCallback(async (message: RoomMessageView) => {
    const url = message.attachment?.url;
    const cid = message.speakerId;
    if (!url || !cid || typeof message.id !== 'number') return;
    const unset = looks[cid] === url;
    try {
      const response = await fetch(unset ? `/api/rooms/${roomId}/look?characterId=${encodeURIComponent(cid)}` : `/api/rooms/${roomId}/look`, unset
        ? { method: 'DELETE' }
        : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; lookUrl?: string | null };
      if (!response.ok) throw new Error(data.message || '没设成功');
      setLooks((prev) => ({ ...prev, [cid]: data.lookUrl ?? null }));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [roomId, looks]);

  const redraw = useCallback((message: RoomMessageView) => {
    setImageMode('custom');
    setImagePrompt(message.attachment?.prompt ?? '');
    setImageChar(message.speakerId ?? '');
    setImageOpen(true);
  }, []);


  // 长会话性能（同单聊）：每楼渲染结果按影响它的值缓存，流式时只重画正在写的那一楼；处理函数经 L 取最新的。
  const live = useRef<Record<string, unknown>>({});
  live.current = { switchCandidate, run, saveEdit, translateMessage, removeTranslation, remove, copy, branch, toggleLook, redraw };
  const L = useMemo(() => new Proxy({}, { get: (_t, k: string) => live.current[k] }) as RoomRowActions, []);
  const rowCache = useRef(new Map<number | string, { deps: unknown[]; el: React.ReactElement }>());
  const rowEnv = [members, rulesFor, macrosFor, userName, persona.avatar, accountAvatar, thoughtsOpen, roomId, streaming, streamingId === null, looks, imageBusy, media];
  const rowEnvRef = useRef<unknown[]>(rowEnv);
  if (rowEnv.some((v, i) => v !== rowEnvRef.current[i])) { rowEnvRef.current = rowEnv; rowCache.current.clear(); }
  const cachedRow = (message: (typeof messages)[number], index: number) => {
    const id = message.id;
    const isLast = index === messages.length - 1;
    const deps: unknown[] = [
      message, isLast, !message.role || message.role === 'user' ? 0 : index <= firstUserIndex, messages.length - index,
      editing !== null && editing.id === id ? editing : null,
      streamingId === id, openActions === id, flipped.has(id), translating === id, switching === id, copied === id, confirming === id,
      typeof id === 'number' ? mvuRev.get(id) : undefined,
    ];
    const hit = rowCache.current.get(id);
    if (hit && hit.deps.every((v, k) => v === deps[k])) return hit.el;
    const el = (
      <RoomMessageRow key={id} message={message} index={index} total={messages.length} firstUserIndex={firstUserIndex} members={members} editing={editing} setEditing={setEditing} streaming={streaming} streamingId={streamingId} flipped={flipped} setFlipped={setFlipped} openActions={openActions} setOpenActions={setOpenActions} swipeStart={swipeStart} L={L} userName={userName} personaAvatar={persona.avatar} accountAvatar={accountAvatar} thoughtsOpen={thoughtsOpen} rulesFor={rulesFor} macrosFor={macrosFor} roomId={roomId} mvuRev={mvuRev} translating={translating} media={media} looks={looks} imageBusy={imageBusy} switching={switching} confirming={confirming} setConfirming={setConfirming} copied={copied} />
    );
    rowCache.current.set(id, { deps, el });
    return el;
  };
  if (rowCache.current.size > messages.length * 2 + 50) {
    const ids = new Set(messages.map((m) => m.id));
    for (const k of rowCache.current.keys()) if (!ids.has(k)) rowCache.current.delete(k);
  }

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
                    <span className={`p-avatar${member.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '24px', ['--h' as string]: member.hue }}>{member.avatar ? <img src={member.avatar} alt="" loading="lazy" /> : member.initial}</span>
                    {member.name}
                  </button>
                ))}
              </div>
            </section>
          )}
          {messages.map(cachedRow)}
          <div ref={bottomRef} className="chat-bottom" />
        </div>
      </div>

      <RoomComposer
        roomId={roomId}
        strategy={strategy}
        members={members}
        error={error}
        qr={qr}
        setQr={setQr}
        runQuickReply={runQuickReply}
        streaming={streaming}
        typing={typing}
        impersonating={impersonating}
        forceTalk={forceTalk}
        speakerId={speakerId}
        setSpeakerId={setSpeakerId}
        draft={draft}
        setDraft={setDraft}
        send={send}
        onStop={() => abortRef.current?.abort()}
        messageCount={messages.length}
        continueLast={continueLast}
        impersonate={impersonate}
        media={media}
        imageBusy={imageBusy}
        setImageOpen={setImageOpen}
        personaInit={personaInit}
        personaLock={personaLock}
        persona={persona}
        onPersonaChange={(next) => { setPersonaLock(next.locked); setPersona(next.persona); }}
      />

      {imageOpen && (
        <ImageGenModal
          modes={ROOM_IMAGE_MODES}
          mode={imageMode}
          setMode={setImageMode}
          prompt={imagePrompt}
          setPrompt={setImagePrompt}
          busy={imageBusy}
          cost={media?.imageCost ?? 0}
          placeholders={{ custom: '例如：雨夜的茶馆，三个人围着一盏油灯，窗外是长街', hint: '例如：水彩风、远景、雨夜' }}
          tail="生成后作为一条消息插入群聊，不会发给模型。"
          onClose={() => setImageOpen(false)}
          onSubmit={() => void makeImage()}
          extra={
            <div className="field">
              <label htmlFor="room-img-char">{imageMode === 'scene' ? '主角' : '画谁'}</label>
              <Select id="room-img-char" className="p-select" value={imageChar} disabled={imageBusy} onChange={(event) => setImageChar(event.target.value)}>
                <option value="">{imageMode === 'scene' || imageMode === 'last' ? `自动（最近发言的${lastSpeakerId ? `：${members.find((member) => member.id === lastSpeakerId)?.name ?? ''}` : ''}）` : `自动（${members[0]?.name ?? ''}）`}</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </Select>
            </div>
          }
          refNote={media?.reference && imageFocus && (
            <p className="small p-img-ref" style={{ margin: 0 }}>
              {members.find((member) => member.id === imageFocus)?.name ?? '角色'}的长相参考：{looks[imageFocus] ? '你设的定妆照' : media.hasImage[imageFocus] ? '角色封面' : messages.some((item) => item.attachment?.kind === 'image' && item.attachment.mode === 'character' && item.speakerId === imageFocus) ? '本群聊第一张 TA 的立绘' : '暂无，建议先给 TA 画一张「角色立绘」，之后的图都会照它画'}
            </p>
          )}
        />
      )}
    </>
  );
}
