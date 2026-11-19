'use client';

import { useEffect, useRef, useState } from 'react';

// 沙盒渲染角色卡里的 HTML（前端美化、状态栏、状态图）。
// iframe 指向 /sandbox/frame.html：sandbox 不给 allow-same-origin，脚本能跑但碰不到本站 cookie 和外层 DOM；
// 该路径有独立 CSP（允许外链图片/字体/样式/脚本，禁止 fetch/XHR 外发）。高度由 frame 回报。
const MAX_HEIGHT = 2400;

// 状态栏脚本（酒馆助手 / MVU 写法）要读变量时，先按楼层取一次再交给 frame；同一楼同一内容只取一次
const HELPER_RE = /getVariables|Mvu\b|stat_data|getCurrentMessageId|getChatMessages|TavernHelper|SillyTavern|waitGlobalInitialized/;
const varCache = new Map<string, Promise<unknown>>();
function loadVariables(chatId: number, messageId: number, version: string): Promise<unknown> {
  const key = `${chatId}:${messageId}:${version}`;
  let hit = varCache.get(key);
  if (!hit) {
    hit = fetch(`/api/chats/${chatId}/variables?message=${messageId}`, { cache: 'no-store' })
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
  variables?: { chatId: number; messageId: number; version: string };
  macros?: { char?: string; user?: string };
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(48);
  const sent = useRef(false);

  useEffect(() => {
    sent.current = false;
    const frame = ref.current;
    if (!frame) return;
    // 服务端渲染的 iframe 可能在水合前就加载完了（错过 tavern-ready），所以挂载时、load 时、ready 时都发一次；frame 只认第一次
    let vars: unknown = null;
    let ready = !(variables && HELPER_RE.test(html));
    let cancelled = false;
    if (!ready && variables) {
      void loadVariables(variables.chatId, variables.messageId, variables.version).then((value) => {
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
      const scheme = document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light';
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
  }, [html, variables?.chatId, variables?.messageId, variables?.version, macros?.char, macros?.user]);

  return (
    <iframe
      ref={ref}
      className="rp-html-frame"
      src="/sandbox/frame.html"
      sandbox="allow-scripts allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
      title={title}
      style={{ height, overflow: height >= MAX_HEIGHT ? 'auto' : 'hidden' }}
      scrolling={height >= MAX_HEIGHT ? 'yes' : 'no'}
    />
  );
}
