'use client';
import { fetchGenPrefs } from '@/lib/gen-prefs-client';
import { joinList } from '@/lib/i18n/runtime';

import { emitPoints } from '@/lib/points-bus';
import { MessageRow } from '@/components/chat-message-row';
import { readSse } from '@/lib/sse-client';
import { langLabel as langName } from '@/lib/translation';
import { useThoughtsOpen, type ThoughtView } from '@/components/thought-block';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { hasMvuCommands } from '@/lib/mvu-text';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/settings-ui';
import { RpText } from '@/components/rp-text';
import { usesDepth } from '@/components/rich-text';
import { emitHelperEvent, type HelperActions } from '@/lib/helper-events';
import type { RegexRule } from '@/lib/resources';
import type { RegexMacros } from '@/lib/regex-apply';
import { ModelPicker, NewbieTip } from '@/components/model-picker';
import { PersonaSwitch, type PersonaCurrent, type PersonaOption } from '@/components/persona-switch';
import { isSlash } from '@/lib/slash-detect';
import { activeQrSets, findQuickReply, planQuickReply, type QrItem, type QrSet, type QrState, type QrAuto } from '@/lib/quick-replies';
import { askChoice, askPrompt, showAlert } from '@/components/ui-dialog';

// 首屏用不到的部分按需加载：卡内助手脚本运行器（只在有脚本时显示，纯客户端）、快捷回复栏（有快捷回复集才渲染）
const HelperRunner = dynamic(() => import('@/components/helper-runner').then((m) => m.HelperRunner), { ssr: false });
const QuickReplyBar = dynamic(() => import('@/components/quick-reply-bar').then((m) => m.QuickReplyBar));

export type ChatAttachmentView = { kind: 'image' | 'audio'; url: string; prompt?: string; mode?: string; width?: number; height?: number; createdAt: number };

export type ChatMessageView = {
  id: number | string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  candidateCount: number;
  selected: number;
  bookmark?: boolean;
  checkpoint?: number | null;
  attachment?: ChatAttachmentView | null;
  personaName?: string | null;
  personaAvatar?: string | null;
  thought?: ThoughtView | null;
  createdAt?: number;
  /** ST 隐藏（幽灵）：不发给模型 */
  hidden?: boolean;
  /** 生成信息：模型 / 输出 tokens / 耗时 */
  meta?: { model: string; tokens: number; ms: number; at: number; cut?: boolean } | null;
  /** 这次生成停在了回复长度上限（finish_reason=length） */
  cut?: boolean;
  /** 译文（ST Translate）；original=true 时 text 是玩家原话，正文是发给模型的译文 */
  translation?: { lang: string; text: string; original: boolean } | null;
};

export type ChatRoomMedia = { image: boolean; tts: boolean; imageCost: number; reference?: boolean; lookUrl?: string | null; characterHasImage?: boolean };
export type EditingState = { id: number; draft: string; thought?: string | null } | null;

type Props = {
  /** 账号头像：身份没设头像时，玩家消息用它（只影响显示） */
  accountAvatar?: string | null;
  chatId: number;
  characterName: string;
  initialMessages: ChatMessageView[];
  initialHasMore?: boolean;
  /** 第一条已加载消息之前还有几条（ST 楼层号 = 偏移 + 序号） */
  initialOffset?: number;
  quickReplies?: QrState;
  media?: ChatRoomMedia;
  title?: string;
  personaName?: string;
  /** 身份切换：当前生效身份、可选身份、锁定在本对话的身份 */
  persona?: { current: PersonaCurrent; options: PersonaOption[]; lockedId: number | null };
  characterCover?: string | null;
  characterHue?: number;
  // 「仅显示」正则（玩家规则 + 角色卡自带脚本）与 {{char}}/{{user}}
  displayRules?: RegexRule[];
  macros?: RegexMacros;
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
  reasoning?: ThoughtView | null;
  autoContinue?: boolean;
  cut?: boolean;
};



// 楼层里的事件处理通过这个代理读最新的函数和状态（见 cachedRow）
export type RowActions = {
  switchCandidate: (message: ChatMessageView, index: number) => Promise<void>; regenerate: (message: ChatMessageView) => Promise<void> | void; saveEdit: () => Promise<void>;
  translateMessage: (id: number, auto?: boolean) => Promise<void>; removeTranslation: (id: number) => Promise<void>; continueLast: () => Promise<void>;
  removeFrom: (id: number) => Promise<void>; remove: (id: number) => Promise<void>; copy: (message: ChatMessageView) => Promise<void>;
  speak: (message: ChatMessageView) => Promise<void>; toggleBookmark: (message: ChatMessageView) => Promise<void>; branch: (message: ChatMessageView, checkpoint?: boolean) => Promise<void>;
  toggleHidden: (message: ChatMessageView) => Promise<void>; toggleLook: (message: ChatMessageView) => Promise<void>; streaming: boolean; editing: EditingState;
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
const NO_RULES: RegexRule[] = [];

export function ChatRoom({ accountAvatar = null, chatId, characterName, initialMessages, initialHasMore = false, initialOffset = 0, quickReplies: qrInitial, media, title, personaName: initialPersonaName, persona: personaInit, characterCover = null, characterHue = 212, displayRules = NO_RULES, macros }: Props) {
  const router = useRouter();
  const [persona, setPersona] = useState<PersonaCurrent>(personaInit?.current ?? { id: null, name: initialPersonaName || '你', avatar: null });
  const [personaLock, setPersonaLock] = useState<number | null>(personaInit?.lockedId ?? null);
  const personaName = persona.name;
  // 显示时的 {{user}} 跟着当前身份走（ST 显示宏用当前 name1）
  const displayMacros = useMemo(() => ({ ...(macros ?? {}), user: persona.name } as RegexMacros), [macros, persona.name]);
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  // MVU 变量是按楼层重放出来的：前面任何一楼的变量命令变了（编辑、重生、换候选、删除），
  // 后面各楼的状态栏都要重新取。这里给每楼算一个「此前所有变量命令」的累积指纹，交给状态栏当缓存版本。
  const mvuHashes = useRef(new Map<number | string, { content: string; h: number }>());
  const mvuRev = useMemo(() => {
    const rev = new Map<number, string>();
    const cache = mvuHashes.current;
    let acc = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && typeof m.content === 'string') {
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
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [offset, setOffset] = useState(initialOffset);
  const offsetRef = useRef(initialOffset);
  offsetRef.current = offset;
  const [notice, setNotice] = useState('');
  const [slashHelp, setSlashHelp] = useState<{ cmd: string; desc: string }[] | null>(null);
  const [qr, setQr] = useState<QrState>(qrInitial ?? { sets: [], globalIds: [], scopeIds: [] });
  const qrRef = useRef(qr);
  qrRef.current = qr;
  // 自动执行的快捷回复（玩家发消息后 / 角色回复后…）在 runQuickReply 里定义，这里先占位，避免 send 依赖它
  const qrAutoRef = useRef<(kind: keyof QrAuto) => Promise<void>>(async () => {});
  const [confirmingFrom, setConfirmingFrom] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [preview, setPreview] = useState(false);
  useEffect(() => { try { setPreview(localStorage.getItem('tavern_compose_preview') === '1'); } catch {} }, []);
  const togglePreview = () => setPreview((on) => { try { localStorage.setItem('tavern_compose_preview', on ? '0' : '1'); } catch {} return !on; });
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<number | string | null>(null);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState<{ type: 'send' } | { type: 'reply' } | { type: 'regen'; message: ChatMessageView } | null>(null);
  // 本次流里收到了错误事件且没有产出（服务端已保存玩家消息）
  const streamErrorRef = useRef(false);
  const [billing, setBilling] = useState<{ cost: number; balance: number; free?: number } | null>(null);
  const [editing, setEditing] = useState<EditingState>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const [openActions, setOpenActions] = useState<number | string | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageMode, setImageMode] = useState<'scene' | 'last' | 'character' | 'custom'>('scene');
  const [imageBusy, setImageBusy] = useState(false);
  // 定妆照：这个角色以后生图都照它的长相画
  const [lookUrl, setLookUrl] = useState<string | null>(media?.lookUrl ?? null);
  const abortRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef<{ id: number; content: string } | null>(null);
  const thoughtsOpen = useThoughtsOpen();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const prependingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // 只有读者本来就在底部时才跟随新内容；往上翻旧剧情时不打扰，改为显示「回到最新」
  const stickRef = useRef(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const lastCountRef = useRef(initialMessages.length);
  const followFrameRef = useRef(0);

  const scrollTarget = useCallback((): { top: number; height: number; client: number } => {
    const el = scrollRef.current;
    if (el && el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible') {
      return { top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight };
    }
    const doc = document.scrollingElement ?? document.documentElement;
    return { top: doc.scrollTop, height: doc.scrollHeight, client: window.innerHeight };
  }, []);

  useEffect(() => {
    // 一帧最多量一次：长会话里每次滚动都读 scrollHeight 会强制重排（流式输出时一秒几十次）
    let frame = 0;
    const measure = () => {
      frame = 0;
      const { top, height, client } = scrollTarget();
      const near = height - (top + client) < 140;
      stickRef.current = near;
      setAwayFromBottom(!near);
      if (near) setUnseen(0);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const el = scrollRef.current;
    el?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
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
      // 流式输出每个片段都会走到这里；合并到下一帧只滚一次，避免每片段一次同步重排
      if (grew && lastIsUser) stickRef.current = true;
      if (!followFrameRef.current) {
        followFrameRef.current = requestAnimationFrame(() => {
          followFrameRef.current = 0;
          if (stickRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
        });
      }
    } else if (grew) {
      setUnseen((count) => count + 1);
    }
  }, [messages]);

  const resync = useCallback(async () => {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: ChatMessageView[]; offset?: number; hasMore?: boolean };
      if (Array.isArray(data.messages)) {
        setMessages(data.messages);
        if (typeof data.offset === 'number') setOffset(data.offset);
        if (typeof data.hasMore === 'boolean') setHasMore(data.hasMore);
      }
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
      const data = (await response.json()) as { messages?: ChatMessageView[]; hasMore?: boolean; offset?: number };
      if (Array.isArray(data.messages) && data.messages.length) {
        prependingRef.current = true;
        if (typeof data.offset === 'number') setOffset(data.offset);
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

  // ---- 消息翻译（ST Translate）----
  const [translating, setTranslating] = useState<number | null>(null);
  const [translatingInput, setTranslatingInput] = useState(false);
  // 默认显示译文；点「原文」的消息记在这里
  const [flipped, setFlipped] = useState<Set<number | string>>(() => new Set());
  const translatePrefsRef = useRef<{ target: string; auto: 'none' | 'responses' | 'inputs' | 'both'; modelLang: string }>({ target: 'zh-CN', auto: 'none', modelLang: 'en' });
  useEffect(() => {
    void fetchGenPrefs().then((prefs) => {
      if (prefs?.translate) translatePrefsRef.current = prefs.translate;
    });
  }, []);
  const translateMessage = useCallback(async (id: number, quiet = false) => {
    setTranslating(id);
    try {
      const response = await fetch(`/api/messages/${id}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = (await response.json().catch(() => ({}))) as { translation?: ChatMessageView['translation']; message?: string; cost?: number; balance?: number; free?: number };
      if (!response.ok) throw new Error(data.message || '翻译失败');
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, translation: data.translation ?? null } : item)));
      setFlipped((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
      emitPoints(data);
    } catch (caught) {
      setError(`${quiet ? '自动翻译没成功：' : ''}${(caught as Error).message}`);
    } finally {
      setTranslating(null);
    }
  }, []);
  const removeTranslation = useCallback(async (id: number) => {
    await fetch(`/api/messages/${id}/translate`, { method: 'DELETE' }).catch(() => undefined);
    setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, translation: null } : item)));
  }, []);
  const translateRef = useRef(translateMessage);
  translateRef.current = translateMessage;

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
      let text = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await readSse<any>(response.body, (event) => {
        try {
          if (event.type === 'delta') { text += event.text; setDraft(text); }
          else if (event.type === 'done') { setDraft(event.text || text); if (typeof event.cost === 'number') { setBilling({ cost: event.cost, balance: event.balance, free: event.free }); emitPoints(event); } }
          else if (event.type === 'error') setError(event.message ?? '代写失败');
        } catch { /* 忽略坏分片 */ }
      });
      inputRef.current?.focus();
    } catch {
      setError('代写失败，请稍后再试');
    } finally {
      setImpersonating(false);
    }
  }, [chatId, draft, impersonating, streaming]);

  // ST 自动继续：最多接 5 次，玩家点停止或某次没续出内容就停
  const runAutoContinue = useCallback(async () => {
    for (let round = 0; round < 5; round += 1) {
      const next = autoContinueRef.current;
      if (!next) return;
      autoContinueRef.current = null;
      const accepted = await streamInto(`/api/messages/${next.id}/continue`, {}, next.id, undefined, next.content);
      if (!accepted) return;
      emitHelperEvent('message_updated', { dbId: next.id });
    }
    autoContinueRef.current = null;
  }, [streamInto]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? draft).trim();
    if (streaming || translatingInput) return;
    // 斜杠命令（ST STscript 常用子集）
    if (override === undefined && isSlash(text)) {
      setDraft('');
      await slashRef.current(text);
      return;
    }
    // ST：空着点发送 = 不加玩家消息，让角色接着回复
    if (!text && !messages.length) return;
    // ST「自动翻译输入」：先把玩家写的话翻成发给模型的语言，原话留着显示
    let outgoing = text;
    let original = '';
    const autoMode = translatePrefsRef.current.auto;
    if (text && (autoMode === 'inputs' || autoMode === 'both')) {
      setTranslatingInput(true);
      try {
        const response = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, chatId }) });
        const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string; cost?: number; balance?: number; free?: number };
        if (!response.ok || !data.text) throw new Error(data.message || '翻译失败');
        emitPoints(data);
        if (data.text.trim() !== text) { outgoing = data.text.trim(); original = text; }
      } catch (caught) {
        setError(`输入没翻译成功，消息还没发送：${(caught as Error).message}`);
        return;
      } finally {
        setTranslatingInput(false);
      }
    }
    const stamp = Date.now();
    const assistantKey = `local-assistant-${stamp}`;
    setMessages((prev) => [
      ...prev,
      ...(text ? [{ id: `local-user-${stamp}`, role: 'user' as const, content: outgoing, candidateCount: 0, selected: 0, personaName: persona.name, personaAvatar: persona.avatar, createdAt: Date.now(), translation: original ? { lang: '', text: original, original: true } : null }] : []),
      { id: assistantKey, role: 'assistant', content: '', candidateCount: 0, selected: 0, createdAt: Date.now() },
    ]);
    // 被限流/失败时不吞掉用户输入：请求没被接受就把草稿放回去
    emitHelperEvent('generation_started', 'normal');
    const accepted = await streamInto(`/api/chats/${chatId}/messages`, original ? { text: outgoing, original } : { text }, assistantKey, () => { if (override === undefined) setDraft(''); });
    if (accepted) {
      emitHelperEvent('message_sent', { fromEnd: 1 });
      emitHelperEvent('message_received', { fromEnd: 0 });
      emitHelperEvent('character_message_rendered', { fromEnd: 0 });
      emitHelperEvent('generation_ended', { fromEnd: 0 });
      await runAutoContinue();
      if (text) await qrAutoRef.current('user');
      if (!streamErrorRef.current) await qrAutoRef.current('ai');
    }
    if (!accepted) {
      // 请求未被接受：撤掉本地乐观消息，避免留下空气泡
      setMessages((prev) => prev.filter((item) => item.id !== assistantKey && item.id !== `local-user-${stamp}`));
      if (override === undefined) setDraft((current) => (current ? current : text));
      setFailed({ type: 'send' });
    } else if (streamErrorRef.current) {
      // 玩家消息已保存、回复失败：重试 = 不再加玩家消息，直接让角色回复（ST 同样保留玩家消息）
      setFailed({ type: 'reply' });
    } else {
      setFailed(null);
    }
  }, [chatId, draft, streaming, translatingInput, streamInto, runAutoContinue, messages.length, persona.name, persona.avatar]);

  const regenerate = useCallback(
    async (message: ChatMessageView) => {
      if (streaming || typeof message.id !== 'number') return;
      setEditing(null);
      setConfirming(null);
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: '', thought: null } : item)));
      setFailed(null);
      emitHelperEvent('generation_started', 'regenerate');
      const accepted = await streamInto(`/api/messages/${message.id}/regenerate`, {}, message.id);
      if (accepted) {
        emitHelperEvent('message_swiped', { dbId: message.id });
        emitHelperEvent('message_received', { dbId: message.id });
        emitHelperEvent('character_message_rendered', { dbId: message.id });
        emitHelperEvent('generation_ended', { dbId: message.id });
        await runAutoContinue();
        if (!streamErrorRef.current) await qrAutoRef.current('ai');
      }
      if (!accepted) {
        // 重新生成没被接受：恢复原文，不把消息清空
        setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: message.content } : item)));
        setFailed({ type: 'regen', message });
      }
    },
    [streaming, streamInto, runAutoContinue],
  );

  // ST「继续」：最后一条是角色消息时接着它往下写（不插玩家消息）；否则退回发一句「*继续*」
  const continueLast = useCallback(async () => {
    if (streaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || typeof last.id !== 'number' || !last.content) {
      void send('*继续*');
      return;
    }
    setFailed(null);
    emitHelperEvent('generation_started', 'continue');
    const accepted = await streamInto(`/api/messages/${last.id}/continue`, {}, last.id, undefined, last.content);
    if (accepted) {
      emitHelperEvent('message_updated', { dbId: last.id });
      emitHelperEvent('generation_ended', { dbId: last.id });
      await runAutoContinue();
    } else {
      setMessages((prev) => prev.map((item) => (item.id === last.id ? { ...item, content: last.content } : item)));
    }
  }, [messages, streaming, streamInto, send, runAutoContinue]);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const content = editing.draft.trim();
    if (!content) return;
    try {
      const response = await fetch(`/api/messages/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing.thought === undefined ? { content } : { content, reasoning: editing.thought ?? '' }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: ChatMessageView & { thought?: ThoughtView | null }; messageText?: string };
      if (!response.ok || !data.message) throw new Error('保存失败');
      const saved = data.message;
      const touchedThought = editing.thought !== undefined;
      setMessages((prev) => prev.map((item) => (item.id === editing.id ? { ...item, content: saved.content, ...(touchedThought ? { thought: saved.thought ?? null } : {}) } : item)));
      setEditing(null);
      emitHelperEvent('message_edited', { dbId: editing.id });
      emitHelperEvent('message_updated', { dbId: editing.id });
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
      emitHelperEvent('message_deleted', { dbId: id });
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
      const data = (await response.json().catch(() => ({}))) as { content?: string; index?: number; message?: string; thought?: ThoughtView | null; meta?: ChatMessageView['meta'] };
      if (!response.ok || typeof data.content !== 'string') throw new Error(data.message || '切换失败');
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, content: data.content!, selected: data.index ?? index, thought: data.thought ?? null, cut: undefined, meta: data.meta ?? null } : item)));
      emitHelperEvent('message_swiped', { dbId: message.id });
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSwitching(null);
    }
  }, []);

  // ---- ST 对齐：隐藏 / 删到最后 / 旁白 / 斜杠命令（/api/chats/[id]/ops）----
  const ops = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/chats/${chatId}/ops`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { message?: ChatMessageView | string; ids?: number[]; hidden?: boolean; deleted?: number; text?: string; value?: unknown; current?: unknown; chat?: unknown; global?: unknown };
    if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : '操作失败');
    return data;
  }, [chatId]);

  // /gen、/genraw：只拿文字（SSE，和代写同一个接口），不落库
  const genText = useCallback(async (mode: 'gen' | 'genraw', prompt: string, length?: number) => {
    const response = await fetch(`/api/chats/${chatId}/impersonate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, prompt, length }) });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message || '生成失败');
    }
    let text = '';
    let done: string | null = null;
    await readSse<{ type: string; text?: string; message?: string; balance?: number; cost?: number; free?: number }>(response.body, (event) => {
      if (event.type === 'delta') text += event.text ?? '';
      else if (event.type === 'done') {
        done = event.text ?? text;
        if (typeof event.balance === 'number') { setBilling({ cost: event.cost ?? 0, balance: event.balance, free: event.free }); emitPoints(event); }
      } else if (event.type === 'error') throw new Error(event.message || '生成失败');
    });
    return (done ?? text).trim();
  }, [chatId]);

  const toggleHidden = useCallback(async (message: ChatMessageView) => {
    if (typeof message.id !== 'number') return;
    const next = !message.hidden;
    try {
      await ops({ op: next ? 'hide' : 'unhide', ids: [message.id] });
      setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, hidden: next } : item)));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [ops]);

  const removeFrom = useCallback(async (id: number) => {
    try {
      await ops({ op: 'delete-from', messageId: id });
      setMessages((prev) => prev.filter((item) => typeof item.id !== 'number' || item.id < id));
      setConfirmingFrom(null);
      emitHelperEvent('message_deleted', { dbId: id });
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [ops]);

  const regenRef = useRef(regenerate);
  regenRef.current = regenerate;
  const continueRef = useRef(continueLast);
  continueRef.current = continueLast;
  const impersonateRef = useRef(impersonate);
  impersonateRef.current = impersonate;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const runSlash = useCallback(async (text: string) => {
    setError('');
    try {
      // 命令解析与媒体命令按需加载（首屏不带）
      const [{ SLASH_HELP, VAR_COMMANDS, parseSlash }, { runBgCommand, runExpressionCommand }] = await Promise.all([import('@/lib/slash'), import('@/lib/slash-media')]);
      // ST 管道：上一条命令的结果是下一条的 {{pipe}}；参数为空时直接用它
      let pipe = '';
      for (const command of parseSlash(text)) {
        const { name, named } = command;
        let arg = command.arg.replace(/\{\{pipe\}\}/gi, () => pipe);
        if (!arg && pipe && !named.key) arg = pipe;
        if (/\{\{/.test(arg) && name !== 'setinput') arg = String((await ops({ op: 'expand', text: arg })).text ?? arg);
        if (name in VAR_COMMANDS) {
          const [scope, action] = VAR_COMMANDS[name];
          // ST：/setvar key=名字 值；也认 /setvar 名字 值 和 /getvar 名字
          let varName = named.key ?? named.name ?? '';
          let value = arg;
          if (!varName) {
            const parts = arg.split(/\s+/);
            varName = parts.shift() ?? '';
            value = parts.join(' ');
          }
          if (!varName) throw new Error(`/${name} 要写变量名，例如 /${name} key=好感度 ${action === 'set' || action === 'add' ? '10' : ''}`.trim());
          const data = await ops({ op: 'var', scope, action, name: varName, value: named.value ?? value });
          pipe = String(data.value ?? '');
          if (action === 'get') setNotice(pipe === '' ? `${varName}（未设置）` : `${varName} = ${pipe}`);
          else if (action === 'flush') setNotice(`已删除变量 ${varName}`);
          else setNotice(`${varName} = ${typeof data.current === 'object' ? JSON.stringify(data.current) : String(data.current ?? '')}`);
          continue;
        }
        if (name === 'listvar') {
          const data = await ops({ op: 'var', action: 'list' });
          const fmt = (obj: unknown) => Object.entries((obj ?? {}) as Record<string, unknown>).map(([k, v]) => `${k} = ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n') || '（无）';
          setNotice(`聊天变量：\n${fmt(data.chat)}\n全局变量：\n${fmt(data.global)}`);
          continue;
        }
        pipe = '';
        if (name === 'help') setSlashHelp(SLASH_HELP);
        else if (name === 'sys' || name === 'send') {
          if (!arg) throw new Error(`/${name} 后面要写内容`);
          const data = await ops({ op: name === 'sys' ? 'narrate' : 'send', text: arg });
          if (data.message && typeof data.message === 'object') setMessages((prev) => [...prev, data.message as ChatMessageView]);
        } else if (name === 'trigger') await sendRef.current('');
        else if (name === 'continue') await continueRef.current();
        else if (name === 'regen') {
          const last = [...messagesRef.current].reverse().find((item) => item.role === 'assistant');
          if (last) await regenRef.current(last);
        } else if (name === 'impersonate') {
          setDraft(arg);
          await sleep(0);
          await impersonateRef.current();
        } else if (name === 'hide' || name === 'unhide') {
          if (!/\d/.test(arg)) throw new Error(`/${name} 后面写楼层号，例如 /${name} 3-5`);
          const data = await ops({ op: name, range: arg });
          const ids = new Set(data.ids ?? []);
          setMessages((prev) => prev.map((item) => (typeof item.id === 'number' && ids.has(item.id) ? { ...item, hidden: name === 'hide' } : item)));
          setNotice(`已${name === 'hide' ? '隐藏' : '取消隐藏'} ${ids.size} 条`);
        } else if (name === 'cut' || name === 'del') {
          const body = name === 'cut' ? { op: 'delete', range: arg } : { op: 'delete', last: Number(arg) || 1 };
          if (name === 'cut' && !/\d/.test(arg)) throw new Error('/cut 后面写楼层号，例如 /cut 3-5');
          const data = await ops(body);
          await resync();
          setNotice(`已删除 ${data.deleted ?? 0} 条`);
        } else if (name === 'setinput') {
          setDraft(arg);
          inputRef.current?.focus();
        } else if (name === 'echo') {
          setNotice(arg);
          pipe = arg;
        }
        else if (name === 'sendas' || name === 'comment') {
          if (!arg) throw new Error(`/${name} 后面要写内容`);
          const data = await ops({ op: name, text: arg, name: named.name ?? '' });
          if (data.message && typeof data.message === 'object') setMessages((prev) => [...prev, data.message as ChatMessageView]);
        } else if (name === 'gen' || name === 'genraw') {
          if (!arg) throw new Error(`/${name} 后面要写提示`);
          setNotice('生成中…');
          pipe = await genText(name, arg, Number(named.length) || undefined);
          setNotice('');
        } else if (name === 'input') {
          const value = await askPrompt({ message: arg, defaultValue: named.default ?? '', multiline: named.rows ? Number(named.rows) > 1 : false });
          if (value === null) break;
          pipe = value;
        } else if (name === 'buttons') {
          let labels: string[] = [];
          try { labels = JSON.parse(named.labels ?? '[]'); } catch { labels = String(named.labels ?? '').split(','); }
          labels = labels.map((label) => String(label).trim()).filter(Boolean);
          if (!labels.length) throw new Error('/buttons 要写 labels=["选项1","选项2"]');
          const value = await askChoice(arg, labels);
          if (value === null) break;
          pipe = value;
        } else if (name === 'popup') {
          await showAlert(arg);
        } else if (name === 'qr') {
          const state = qrRef.current;
          const pool = named.set ? state.sets : activeQrSets(state);
          const found = findQuickReply(pool, { index: named.label ? undefined : Number(arg || named.index), label: named.label ?? (arg && !/^\d+$/.test(arg) ? arg : undefined), set: named.set });
          if (!found) throw new Error(`找不到快捷回复 ${named.label ?? arg}`);
          await runQuickReplyRef.current(found.set, found.item);
        } else if (name === 'qr-list') {
          const state = qrRef.current;
          if (arg) {
            const set = state.sets.find((item) => item.name === arg);
            if (!set) throw new Error(`没有叫「${arg}」的快捷回复集`);
            pipe = JSON.stringify(set.replies.map((item) => item.label));
            setNotice(`${set.name}：${joinList(set.replies.map((item) => item.label)) || '（空）'}`);
          } else {
            pipe = JSON.stringify(state.sets.map((item) => item.name));
            setNotice(`快捷回复集：${joinList(state.sets.map((item) => `${item.name}${state.globalIds.includes(item.id) ? '（全局）' : ''}${state.scopeIds.includes(item.id) ? '（本聊天）' : ''}`)) || '（无）'}`);
          }
        } else if (name.startsWith('qr-set') || name.startsWith('qr-chatset')) {
          const state = qrRef.current;
          const set = state.sets.find((item) => item.name === arg);
          if (!set) throw new Error(`没有叫「${arg}」的快捷回复集`);
          const scoped = name.startsWith('qr-chatset');
          const list = scoped ? state.scopeIds : state.globalIds;
          const on = name.endsWith('-on') ? true : name.endsWith('-off') ? false : !list.includes(set.id);
          const nextIds = on ? [...new Set([...list, set.id])] : list.filter((id) => id !== set.id);
          const response = await fetch('/api/quick-replies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(scoped ? { chatId, scopeIds: nextIds } : { chatId, globalIds: nextIds }) });
          const data = (await response.json().catch(() => ({}))) as QrState & { message?: string };
          if (!response.ok) throw new Error(data.message || '保存失败');
          setQr({ sets: data.sets, globalIds: data.globalIds, scopeIds: data.scopeIds });
          setNotice(`${on ? '已启用' : '已关闭'}快捷回复集「${set.name}」${scoped ? '（本聊天）' : ''}`);
        }
        else if (name === 'bg' || name === 'lockbg' || name === 'unlockbg') {
          const result = await runBgCommand('chat', chatId, name, arg);
          setNotice(result.notice);
          pipe = result.pipe;
          if (result.changed) router.refresh();
        } else if (name === 'reasoning-get' || name === 'reasoning-set') {
          // ST /reasoning-get、/reasoning-set：默认最后一条角色消息；at=楼层号（和 #N 一致）
          const list = messagesRef.current;
          const target = named.at !== undefined
            ? list[Number(named.at) - offsetRef.current]
            : [...list].reverse().find((item) => item.role === 'assistant' && typeof item.id === 'number');
          if (!target || typeof target.id !== 'number') throw new Error(named.at !== undefined ? `找不到第 ${named.at} 楼（可能还没加载）` : '还没有角色消息');
          if (target.role !== 'assistant') throw new Error('只有角色消息有思考内容');
          if (name === 'reasoning-get') {
            pipe = target.thought?.t ?? '';
            setNotice(pipe ? `思考内容：\n${pipe}` : '这条消息没有思考内容');
          } else {
            const response = await fetch(`/api/messages/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reasoning: arg }) });
            const data = (await response.json().catch(() => ({}))) as { message?: ChatMessageView & { thought?: ThoughtView | null }; };
            if (!response.ok || !data.message) throw new Error('保存思考内容失败');
            const thought = data.message.thought ?? null;
            setMessages((prev) => prev.map((item) => (item.id === target.id ? { ...item, thought } : item)));
            pipe = arg;
            setNotice(arg ? '已改写思考内容' : '已删除思考内容');
          }
        } else if (name === 'expression-set' || name === 'expression-list') {
          const result = runExpressionCommand(name, arg);
          setNotice(result.notice);
          pipe = result.pipe;
        }
        else throw new Error(`本站暂不支持 /${name.slice(1)}，输入 /help 查看可用命令`);
      }
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [ops, resync, genText, chatId, router]);
  const slashRef = useRef(runSlash);
  slashRef.current = runSlash;

  // ST 快捷回复：点按钮 / /qr / 自动执行都走这里
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
        inputRef.current?.focus();
        return;
      }
      if (plan.clearInput) setDraft('');
      if (plan.kind === 'slash') await slashRef.current(plan.text);
      else if (plan.text.trim()) await sendRef.current(plan.text);
    } finally {
      qrDepth.current -= 1;
      if (mute) qrMute.current -= 1;
    }
  }, []);
  const runQuickReplyRef = useRef(runQuickReply);
  runQuickReplyRef.current = runQuickReply;
  // 自动执行：自动执行触发的生成不再触发自动执行（ST 也防这种循环）
  qrAutoRef.current = async (kind: keyof QrAuto) => {
    if (qrMute.current > 0) return;
    await sleep(30);
    for (const set of activeQrSets(qrRef.current)) {
      for (const item of set.replies) if (item.auto[kind]) await runQuickReplyRef.current(set, item);
    }
  };
  useEffect(() => {
    // 进入聊天时；打开网站时（这个标签页第一次进聊天）
    let first = false;
    try {
      first = !sessionStorage.getItem('tavern:qr-startup');
      sessionStorage.setItem('tavern:qr-startup', '1');
    } catch { /* 无痕模式 */ }
    void (async () => {
      if (first) await qrAutoRef.current('startup');
      await qrAutoRef.current('chatChange');
    })();
  }, [chatId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), Math.min(12000, 2600 + notice.length * 60));
    return () => clearTimeout(timer);
  }, [notice]);

  // 卡内酒馆助手脚本能调用的动作（components/helper-runner.tsx）
  const sendRef = useRef(send);
  sendRef.current = send;
  const helperActions = useMemo<HelperActions>(() => ({
    send: (text) => { void sendRef.current(text); },
    setInput: (text) => { setDraft(text); inputRef.current?.focus(); },
    slash: (text) => slashRef.current(text),
    editMessage: async (id, content) => {
      const response = await fetch(`/api/messages/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
      const data = (await response.json().catch(() => ({}))) as { message?: ChatMessageView };
      if (!response.ok || !data.message) throw new Error('保存失败');
      const saved = data.message;
      setMessages((prev) => prev.map((item) => (item.id === id ? { ...item, content: saved.content } : item)));
    },
  }), []);

  // ST「创建分支」跳到新会话；「创建检查点」留在这里，消息上挂一个检查点入口
  const branch = useCallback(
    async (message: ChatMessageView, checkpoint = false) => {
      if (typeof message.id !== 'number') return;
      if (checkpoint && message.checkpoint) {
        router.push(`/chats/${message.checkpoint}?from=${chatId}&at=${message.id}`);
        return;
      }
      try {
        const response = await fetch(`/api/chats/${chatId}/branch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: message.id, checkpoint }),
        });
        const data = (await response.json().catch(() => ({}))) as { chatId?: number; message?: string };
        if (!response.ok || !data.chatId) throw new Error(data.message || '分支失败');
        if (checkpoint) {
          const created = data.chatId;
          setMessages((prev) => prev.map((item) => (item.id === message.id ? { ...item, checkpoint: created } : item)));
          setOpenActions(null);
          return;
        }
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
    if (imageMode === 'custom' && !prompt) return;
    setImageBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/chats/${chatId}/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(imageMode === 'custom' ? { mode: 'custom', prompt } : { mode: imageMode, hint: prompt }),
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
  }, [chatId, imagePrompt, imageMode, resync]);

  const toggleLook = useCallback(async (message: ChatMessageView) => {
    const url = message.attachment?.url;
    if (!url || typeof message.id !== 'number') return;
    const unset = lookUrl === url;
    try {
      const response = await fetch(`/api/chats/${chatId}/look`, unset
        ? { method: 'DELETE' }
        : { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id }) });
      const data = (await response.json().catch(() => ({}))) as { message?: string; lookUrl?: string | null };
      if (!response.ok) throw new Error(data.message || '没设成功');
      setLookUrl(data.lookUrl ?? null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [chatId, lookUrl]);

  const copy = useCallback(async (message: ChatMessageView) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(message.id);
      setTimeout(() => setCopied((current) => (current === message.id ? null : current)), 1200);
    } catch {
      setError('复制失败，请手动选中文本');
    }
  }, []);

  const renderRow = (message: ChatMessageView, index: number) => (
    <MessageRow key={message.id} message={message} index={index} total={messages.length} offset={offset} hasMore={hasMore} editing={editing} setEditing={setEditing} streaming={streaming} streamingId={streamingId} flipped={flipped} setFlipped={setFlipped} openActions={openActions} setOpenActions={setOpenActions} swipeStart={swipeStart} L={L} personaName={personaName} personaAvatar={persona.avatar} accountAvatar={accountAvatar} characterCover={characterCover} characterHue={characterHue} characterName={characterName} thoughtsOpen={thoughtsOpen} displayRules={displayRules} displayMacros={displayMacros} chatId={chatId} mvuRev={mvuRev} translating={translating} media={media} lookUrl={lookUrl} imageBusy={imageBusy} switching={switching} confirming={confirming} setConfirming={setConfirming} confirmingFrom={confirmingFrom} setConfirmingFrom={setConfirmingFrom} copied={copied} setImageMode={setImageMode} setImagePrompt={setImagePrompt} setImageOpen={setImageOpen} />
  );

  // 长会话（上千楼）性能：每楼的渲染结果按「会影响这一楼的值」缓存，没变就复用同一个 React 元素，
  // 流式更新时只重画正在写的那一楼。楼里的事件处理一律通过 L 读最新的函数和状态，避免缓存住旧闭包。
  const live = useRef<Record<string, unknown>>({});
  live.current = { switchCandidate, regenerate, saveEdit, translateMessage, removeTranslation, continueLast, removeFrom, remove, copy, speak, toggleBookmark, branch, toggleHidden, toggleLook, streaming, editing };
  const L = useMemo(() => new Proxy({}, { get: (_t, k: string) => live.current[k] }) as RowActions, []);
  const rowCache = useRef(new Map<number | string, { deps: unknown[]; el: React.ReactElement }>());
  const rowEnv = [displayRules, displayMacros, characterCover, characterName, characterHue, personaName, persona.avatar, accountAvatar, thoughtsOpen, media?.tts, media?.reference, lookUrl, imageBusy, chatId];
  const rowEnvRef = useRef<unknown[]>(rowEnv);
  if (rowEnv.some((v, i) => v !== rowEnvRef.current[i])) { rowEnvRef.current = rowEnv; rowCache.current.clear(); }
  const depthMatters = usesDepth(displayRules);
  const cachedRow = (message: ChatMessageView, index: number) => {
    const id = message.id;
    const isLatest = index === messages.length - 1;
    const deps: unknown[] = [
      // 楼层号 = offset + index；往前翻页时两者一增一减、楼层不变，老楼就不必重画
      message, offset + index, isLatest, isLatest ? streaming : false, hasMore && index === 0,
      depthMatters ? messages.length - index : 0,
      editing !== null && editing.id === id ? editing : null,
      streamingId === id, openActions === id, flipped.has(id), translating === id, switching === id, copied === id,
      confirming === id, confirmingFrom === id ? messages.length - index : -1,
      typeof id === 'number' ? mvuRev.get(id) : undefined,
    ];
    const hit = rowCache.current.get(id);
    if (hit && hit.deps.length === deps.length && hit.deps.every((v, i) => v === deps[i])) return hit.el;
    const el = renderRow(message, index);
    rowCache.current.set(id, { deps, el });
    return el;
  };
  if (rowCache.current.size > messages.length * 2 + 50) {
    const ids = new Set(messages.map((m) => m.id));
    for (const k of rowCache.current.keys()) if (!ids.has(k)) rowCache.current.delete(k);
  }

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
          {messages.map(cachedRow)}
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
          {notice && <div className="p-chat-notice" role="status">{notice}</div>}
          {slashHelp && (
            <div className="p-slash-help" role="dialog" aria-label="斜杠命令">
              <div className="p-slash-help-head"><strong>斜杠命令</strong><span className="p-small">和 SillyTavern 写法一致，可以用 | 串联</span><button type="button" className="p-btn p-btn--sm" onClick={() => setSlashHelp(null)}>关闭</button></div>
              <dl>{slashHelp.map((item) => <div key={item.cmd}><dt><code>{item.cmd}</code></dt><dd>{item.desc}</dd></div>)}</dl>
            </div>
          )}
          {error && (
            <div role="alert" className="p-form-error" style={{ margin: '0 0 8px' }}>
              <div>{friendlyError(error)}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {failed && (
                  <button className="p-btn p-btn--sm" type="button" onClick={() => { const action = failed; setFailed(null); setError(''); if (action.type === 'send') void send(); else if (action.type === 'reply') void send(''); else void regenerate(action.message); }}>重试</button>
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
          {qr.sets.length > 0 && <QuickReplyBar state={qr} scope={{ chatId }} onState={setQr} disabled={streaming} onRun={(set, item) => void runQuickReply(set, item)} />}
          <HelperRunner chatId={chatId} names={{ char: characterName, user: personaName || macros?.user || '' }} actions={helperActions} />
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
              placeholder="写下台词，或用 *行动描述* 推进故事…（/ 开头是命令，/help 查看）"
              aria-label="消息"
            />
            {streaming ? (
              <button className="p-chat-send is-stop" type="button" onClick={() => abortRef.current?.abort()} aria-label="停止生成"><span className="rd-stop" aria-hidden="true" /></button>
            ) : (
              <button className="p-chat-send" type="button" onClick={() => void send()} disabled={!draft.trim() && !messages.length} aria-label={draft.trim() ? '发送' : '让角色接着回复'} title={draft.trim() ? undefined : '空着发送：让角色接着回复'}>
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            )}
          </div>
          <div className="p-chat-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 0' }}>
            <span className="p-chat-acts">
              <button className="p-chat-continue p-chat-act" type="button" disabled={streaming || impersonating || messages.length === 0} onClick={() => void continueLast()} title="不写台词，让角色接着上一条往下写">▸ 继续</button>
              <button className="p-chat-act p-chat-imp" type="button" disabled={streaming || impersonating} onClick={() => void impersonate()} title="让 AI 以你的身份写一句（输入框里的字会当作方向提示），写完可以再改">{impersonating ? '代写中…' : '✎ 代写'}</button>
              {translatingInput && <span className="p-chat-tr-busy" role="status">正在把输入翻译成{langName(translatePrefsRef.current.modelLang)}…</span>}
              <button className="p-chat-act p-chat-pv" type="button" aria-pressed={preview} onClick={togglePreview} title="在输入框上方按 RP 排版预览：*动作*、「对白」、((场外))">{preview ? '◉' : '◎'} 预览</button>
              {media?.image && (
                <button className="p-chat-act p-chat-img" type="button" disabled={streaming || imageBusy} onClick={() => setImageOpen(true)} title="按当前剧情生成一张插图，作为消息插入对话">✦ 生图</button>
              )}
              {personaInit && (
                <PersonaSwitch
                  endpoint={`/api/chats/${chatId}/persona`}
                  personas={personaInit.options}
                  lockedId={personaLock}
                  current={persona}
                  onChange={(next) => { setPersonaLock(next.locked); setPersona(next.persona); router.refresh(); }}
                />
              )}
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
              <button className="btn btn--sm btn--primary" type="button" disabled={imageBusy || (imageMode === 'custom' && !imagePrompt.trim())} onClick={() => void makeImage()}>
                {imageBusy ? (imageMode === 'custom' ? '生成中…' : '构思画面并生成…') : '生成'}
              </button>
            </>
          }
        >
          <div className="field">
            <label>画什么</label>
            <div className="p-img-modes" role="radiogroup" aria-label="画什么">
              {([
                ['scene', '当前场景', '按最近几轮对话画出眼下的画面'],
                ['last', '最后一条回复', '把角色刚说的那一幕画出来'],
                ['character', '角色立绘', '按角色设定画一张人物像'],
                ['custom', '自己描述', '完全按你写的内容画'],
              ] as const).map(([value, label, desc]) => (
                <button key={value} type="button" role="radio" aria-checked={imageMode === value} className={`p-img-mode${imageMode === value ? ' is-on' : ''}`} disabled={imageBusy} onClick={() => setImageMode(value)}>
                  <strong>{label}</strong><span>{desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{imageMode === 'custom' ? '画面描述' : '补充要求（可不填）'}</label>
            <textarea
              className="textarea"
              rows={imageMode === 'custom' ? 4 : 2}
              value={imagePrompt}
              maxLength={imageMode === 'custom' ? 900 : 200}
              placeholder={imageMode === 'custom' ? '例如：民国报馆的雨夜，暖黄台灯下两个人对坐，窗外雨幕' : '例如：水彩风、侧脸、雨夜'}
              onChange={(event) => setImagePrompt(event.target.value)}
            />
          </div>
          {media?.reference && (
            <p className="small p-img-ref" style={{ margin: 0 }}>
              人物长相参考：{lookUrl ? '你设的定妆照' : media.characterHasImage ? '角色封面' : messages.some((item) => item.attachment?.kind === 'image' && item.attachment.mode === 'character') ? '本对话第一张角色立绘' : '暂无，建议先画一张「角色立绘」，之后的图都会照它画'}
            </p>
          )}
          <p className="small" style={{ margin: 0 }}>{imageMode === 'custom' ? `会消耗 ${media?.imageCost ?? 0} 点` : `会先让对话模型按剧情写画面描述（按字数少量扣点），再消耗 ${media?.imageCost ?? 0} 点生图`}，生成后作为一条消息插入对话。</p>
        </Modal>
      )}
    </>
  );
}
