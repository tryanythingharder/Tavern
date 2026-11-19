'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_STAGE_KEY, CHAT_STAGE_W_KEY, STAGE_MIN_W } from '@/lib/chat-focus';

// 沉浸模式左侧的「画面栏」（只在沉浸、≥1200px 时显示）：
// 平时是角色立绘；读到带插图的消息（卡里 HTML 的大图、生成的图片、Markdown 图片）时换成那张图，
// 往回翻会跟着换回去，像视觉小说的 CG 栏。点消息里的插图也会在这里放大。
// 右边缘可拖动调宽，双击恢复默认；可以收成窄条，选择都记在 localStorage。
// 画面栏展开时，消息里的大插图缩成一条缩略图，避免同一张图出现两次（见 styles/chat-focus.css 和 frame.html）。

type Shot = { src: string; kind: 'cover' | 'art' };

const READ_LINE = 0.55; // 视口高度的这个位置以上算「已读到」

function messageImages(msg: Element): string[] {
  const out: string[] = [];
  msg.querySelectorAll<HTMLImageElement>('.p-msg-copy ~ figure img, figure img').forEach((img) => { if (img.src) out.push(img.src); });
  msg.querySelectorAll<HTMLIFrameElement>('iframe.rp-html-frame[data-images]').forEach((frame) => {
    try { for (const src of JSON.parse(frame.dataset.images || '[]') as string[]) out.push(src); } catch { /* 坏数据忽略 */ }
  });
  return out;
}

export function ChatStage({ cover, name }: { cover: string; name: string }) {
  const [state, setState] = useState<'open' | 'rail'>('open');
  const [shot, setShot] = useState<Shot>({ src: cover, kind: 'cover' });
  const [prev, setPrev] = useState<Shot | null>(null);
  const [count, setCount] = useState(0);
  const pinned = useRef<string | null>(null);
  const shotRef = useRef(shot);
  shotRef.current = shot;

  const show = useCallback((next: Shot) => {
    if (next.src === shotRef.current.src) return;
    setPrev(shotRef.current);
    setShot(next);
  }, []);

  // 状态与 <html data-chat-stage> 同步（首屏由内联脚本先设好，避免跳动）
  useEffect(() => {
    const root = document.documentElement;
    setState(root.getAttribute('data-chat-stage') === 'rail' ? 'rail' : 'open');
    if (!root.hasAttribute('data-chat-stage')) root.setAttribute('data-chat-stage', 'open');
    return () => { root.removeAttribute('data-chat-stage'); root.style.removeProperty('--stage-open-w'); };
  }, []);

  const setMode = useCallback((next: 'open' | 'rail') => {
    document.documentElement.setAttribute('data-chat-stage', next);
    try { localStorage.setItem(CHAT_STAGE_KEY, next); } catch { /* 隐私模式 */ }
    setState(next);
    window.dispatchEvent(new CustomEvent('tavern:stage', { detail: { open: next === 'open' } }));
  }, []);

  // 跟着阅读位置换图
  useEffect(() => {
    let raf = 0;
    const compute = () => {
      raf = 0;
      const scroller = document.querySelector<HTMLElement>('.p-chat-scroll');
      if (!scroller) return;
      const line = window.innerHeight * READ_LINE;
      const msgs = scroller.querySelectorAll('.p-msg');
      let latest: string | null = null;
      let total = 0;
      msgs.forEach((msg) => {
        const images = messageImages(msg);
        total += images.length;
        if (images.length && msg.getBoundingClientRect().top < line) latest = images[images.length - 1];
      });
      setCount(total);
      if (pinned.current) return;
      show(latest ? { src: latest, kind: 'art' } : { src: cover, kind: 'cover' });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };
    const unpin = () => { pinned.current = null; schedule(); };
    const onPick = (event: Event) => {
      const src = (event as CustomEvent<{ src?: string }>).detail?.src;
      if (!src || document.documentElement.getAttribute('data-chat-stage') !== 'open') return;
      pinned.current = src;
      show({ src, kind: 'art' });
    };
    // 点父页面里的生成图片
    const onClick = (event: MouseEvent) => {
      const img = (event.target as HTMLElement | null)?.closest?.('.p-msg figure img') as HTMLImageElement | null;
      if (img?.src) window.dispatchEvent(new CustomEvent('tavern:stage-pick', { detail: { src: img.src } }));
    };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', unpin, { passive: true });
    window.addEventListener('touchmove', unpin, { passive: true });
    window.addEventListener('tavern:images', schedule);
    window.addEventListener('tavern:stage-pick', onPick);
    document.addEventListener('click', onClick);
    const scroller = document.querySelector('.p-chat-scroll');
    const mo = scroller ? new MutationObserver(schedule) : null;
    if (scroller && mo) mo.observe(scroller, { childList: true, subtree: true });
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', unpin);
      window.removeEventListener('touchmove', unpin);
      window.removeEventListener('tavern:images', schedule);
      window.removeEventListener('tavern:stage-pick', onPick);
      document.removeEventListener('click', onClick);
      mo?.disconnect();
    };
  }, [cover, show]);

  // 拖动右边缘调宽
  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = document.documentElement;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    root.setAttribute('data-chat-stage-drag', '');
    const max = () => Math.round(window.innerWidth * 0.5);
    let width = 0;
    const move = (e: PointerEvent) => {
      width = Math.max(STAGE_MIN_W, Math.min(max(), Math.round(e.clientX)));
      root.style.setProperty('--stage-open-w', `${width}px`);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      root.removeAttribute('data-chat-stage-drag');
      if (width) { try { localStorage.setItem(CHAT_STAGE_W_KEY, String(width)); } catch { /* 隐私模式 */ } }
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };
  const resetWidth = () => {
    document.documentElement.style.removeProperty('--stage-open-w');
    try { localStorage.removeItem(CHAT_STAGE_W_KEY); } catch { /* 隐私模式 */ }
  };
  const nudge = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const root = document.documentElement;
    const now = document.querySelector<HTMLElement>('.chat-stage')?.offsetWidth ?? 400;
    const width = Math.max(STAGE_MIN_W, Math.min(Math.round(window.innerWidth * 0.5), now + (event.key === 'ArrowRight' ? 24 : -24)));
    root.style.setProperty('--stage-open-w', `${width}px`);
    try { localStorage.setItem(CHAT_STAGE_W_KEY, String(width)); } catch { /* 隐私模式 */ }
  };

  const isArt = shot.kind === 'art';
  return (
    <aside className="chat-stage" data-kind={shot.kind} aria-label="画面栏">
      {state === 'open' ? (
        <>
          <div className="chat-stage-view">
            {prev && <Layer key={`p-${prev.src}`} shot={prev} leaving onDone={() => setPrev(null)} />}
            <Layer key={shot.src} shot={shot} />
          </div>
          <div className="chat-stage-cap">
            <div className="chat-stage-name">{name}</div>
            <div className="chat-stage-sub">
              {isArt ? '插图' : '立绘'}{count > 0 && <span> · 共 {count} 张插图</span>}
              {isArt && (
                <button type="button" onClick={() => { pinned.current = cover; show({ src: cover, kind: 'cover' }); }}>回到立绘</button>
              )}
            </div>
          </div>
          <button className="chat-stage-fold" type="button" onClick={() => setMode('rail')} title="收起画面栏" aria-label="收起画面栏">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <div className="chat-stage-grip" role="separator" aria-orientation="vertical" aria-label="拖动调整画面栏宽度（双击恢复默认）"
            tabIndex={0} onPointerDown={onDrag} onDoubleClick={resetWidth} onKeyDown={nudge} />
        </>
      ) : (
        <button className="chat-stage-rail" type="button" onClick={() => setMode('open')} title="展开画面栏" aria-label="展开画面栏">
          <img src={shot.src} alt="" />
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
        </button>
      )}
    </aside>
  );
}

function Layer({ shot, leaving, onDone }: { shot: Shot; leaving?: boolean; onDone?: () => void }) {
  return (
    <div className={`chat-stage-layer${leaving ? ' is-leaving' : ''}`} onAnimationEnd={leaving ? onDone : undefined}>
      {shot.kind === 'art' && <img className="chat-stage-blur" src={shot.src} alt="" aria-hidden="true" />}
      <img className="chat-stage-img" src={shot.src} alt={shot.kind === 'art' ? '当前插图' : ''} />
    </div>
  );
}
