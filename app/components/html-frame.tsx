'use client';

import { useEffect, useRef, useState } from 'react';

// 沙盒渲染角色卡里的 HTML（前端美化、状态栏、状态图）。
// iframe 指向 /sandbox/frame.html：sandbox 不给 allow-same-origin，脚本能跑但碰不到本站 cookie 和外层 DOM；
// 该路径有独立 CSP（允许外链图片/字体/样式/脚本，禁止 fetch/XHR 外发）。高度由 frame 回报。
const MAX_HEIGHT = 2400;

// 状态栏脚本（酒馆助手 / MVU 写法）要读变量时，先按楼层取一次再交给 frame；同一楼同一内容只取一次
const HELPER_RE = /getVariables|Mvu\b|stat_data|getCurrentMessageId|getChatMessages|TavernHelper|SillyTavern|waitGlobalInitialized/;
const varCache = new Map<string, Promise<unknown>>();
function loadVariables(chatId: number, messageId: number, version: string, room = false): Promise<unknown> {
  const key = `${room ? 'r' : 'c'}${chatId}:${messageId}:${version}`;
  let hit = varCache.get(key);
  if (!hit) {
    hit = fetch(`/api/${room ? 'rooms' : 'chats'}/${chatId}/variables?message=${messageId}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    varCache.set(key, hit);
    if (varCache.size > 200) varCache.delete(varCache.keys().next().value as string);
  }
  return hit;
}

export function HtmlFrame({ html, title = '角色卡美化内容', variables, macros }: {
  html: string;
  title?: string;
  /** room=true 时 chatId 是房间 id（群聊） */
  variables?: { chatId: number; messageId: number; version: string; room?: boolean };
  macros?: { char?: string; user?: string };
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(48);
  const sent = useRef(false);
  // 外层切换深浅色时整块重载：卡内适配和作者的 prefers-color-scheme 样式都按新配色重新算
  // 首帧就按 <html data-scheme>（head 内联脚本在水合前已写好）取，深色用户不用再把每个 iframe 重载一遍
  // （重载出来的 iframe 是 lazy 的，离开视口就不加载，往回翻时高度会跳）
  const [scheme, setScheme] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light',
  );
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setScheme(root.dataset.scheme === 'dark' ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['data-scheme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    sent.current = false;
    const frame = ref.current;
    if (!frame) return;
    // 服务端渲染的 iframe 可能在水合前就加载完了（错过 tavern-ready），所以挂载时、load 时、ready 时都发一次；frame 只认第一次
    let vars: unknown = null;
    let ready = !(variables && HELPER_RE.test(html));
    let cancelled = false;
    if (!ready && variables) {
      void loadVariables(variables.chatId, variables.messageId, variables.version, variables.room).then((value) => {
        if (cancelled) return;
        vars = value;
        ready = true;
        post();
      });
    }
    const post = () => {
      if (!frame.contentWindow || !ready) return;
      sent.current = true;
      const host = frame.parentElement ?? document.body;
      const style = getComputedStyle(host);
      frame.contentWindow.postMessage({ type: 'tavern-html', html, color: style.color, font: `${style.fontSize}/${style.lineHeight} ${style.fontFamily}`, scheme, vars, names: { char: macros?.char ?? '', user: macros?.user ?? '' } }, '*');
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; h?: number; list?: unknown; src?: unknown } | null;
      if (data?.type === 'tavern-ready') post();
      else if (data?.type === 'tavern-images' && Array.isArray(data.list)) {
        // 只收 http(s)/data 图片地址，交给左侧画廊（components/chat-stage.tsx）
        const list = data.list.filter((src): src is string => typeof src === 'string' && /^(https?:|data:image\/)/i.test(src)).slice(0, 12);
        frame.dataset.images = JSON.stringify(list);
        window.dispatchEvent(new Event('tavern:images'));
      }
      else if (data?.type === 'tavern-height' && typeof data.h === 'number') setHeight(Math.max(16, Math.min(MAX_HEIGHT, data.h)));
    };
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', post);
    post();
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      frame.removeEventListener('load', post);
    };
  }, [scheme, html, variables?.chatId, variables?.messageId, variables?.version, variables?.room, macros?.char, macros?.user]);

  return (
    <iframe
      // frame 只认第一次 postMessage，变量版本变了（前面楼层改过）要换一个新 iframe
      key={`${scheme}:${variables?.version ?? ''}`}
      ref={ref}
      className="rp-html-frame"
      src="/sandbox/frame.html"
      sandbox="allow-scripts allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
      title={title}
      suppressHydrationWarning
      style={{ height, colorScheme: scheme, overflow: height >= MAX_HEIGHT ? 'auto' : 'hidden' }}
      scrolling={height >= MAX_HEIGHT ? 'yes' : 'no'}
    />
  );
}
