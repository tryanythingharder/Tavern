'use client';

import { useEffect, useRef, useState } from 'react';

// 沙盒渲染角色卡里的 HTML（前端美化、状态栏、状态图）。
// iframe 指向 /sandbox/frame.html：sandbox 不给 allow-same-origin，脚本能跑但碰不到本站 cookie 和外层 DOM；
// 该路径有独立 CSP（允许外链图片/字体/样式/脚本，禁止 fetch/XHR 外发）。高度由 frame 回报。
const MAX_HEIGHT = 2400;

export function HtmlFrame({ html, title = '角色卡美化内容' }: { html: string; title?: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(48);
  const sent = useRef(false);

  useEffect(() => {
    sent.current = false;
    const frame = ref.current;
    if (!frame) return;
    // 服务端渲染的 iframe 可能在水合前就加载完了（错过 tavern-ready），所以挂载时、load 时、ready 时都发一次；frame 只认第一次
    const post = () => {
      if (!frame.contentWindow) return;
      sent.current = true;
      const host = frame.parentElement ?? document.body;
      const style = getComputedStyle(host);
      const scheme = document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light';
      frame.contentWindow.postMessage({ type: 'tavern-html', html, color: style.color, font: `${style.fontSize}/${style.lineHeight} ${style.fontFamily}`, scheme }, '*');
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return;
      const data = event.data as { type?: string; h?: number; list?: unknown; src?: unknown } | null;
      if (data?.type === 'tavern-ready') post();
      else if (data?.type === 'tavern-images' && Array.isArray(data.list)) {
        // 只收 http(s)/data 图片地址，交给画面栏（components/chat-stage.tsx）
        const list = data.list.filter((src): src is string => typeof src === 'string' && /^(https?:|data:image\/)/i.test(src)).slice(0, 12);
        frame.dataset.images = JSON.stringify(list);
        window.dispatchEvent(new Event('tavern:images'));
      } else if (data?.type === 'tavern-pick' && typeof data.src === 'string' && /^(https?:|data:image\/)/i.test(data.src)) {
        window.dispatchEvent(new CustomEvent('tavern:stage-pick', { detail: { src: data.src } }));
      } else if (data?.type === 'tavern-stage-ask') sendStage();
      else if (data?.type === 'tavern-height' && typeof data.h === 'number') setHeight(Math.max(16, Math.min(MAX_HEIGHT, data.h)));
    };
    // 画面栏展开与否告诉 frame（展开时卡里大图缩成缩略图）
    const sendStage = () => {
      const root = document.documentElement;
      const open = root.hasAttribute('data-chat-focus') && root.getAttribute('data-chat-stage') === 'open' && window.innerWidth >= 1200;
      frame.contentWindow?.postMessage({ type: 'tavern-stage', open }, '*');
    };
    const observer = new MutationObserver(sendStage);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-chat-stage', 'data-chat-focus'] });
    window.addEventListener('resize', sendStage);
    window.addEventListener('message', onMessage);
    frame.addEventListener('load', post);
    post();
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', sendStage);
      observer.disconnect();
      frame.removeEventListener('load', post);
    };
  }, [html]);

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
