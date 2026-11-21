'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CHAT_STAGE_KEY, CHAT_STAGE_W_KEY, STAGE_MIN_W } from '@/lib/chat-focus';
import { EXPRESSION_ZH, classifyExpression, pickSprite, type ExpressionLabel, type SpriteMap } from '@/lib/expressions';
import { SpriteManager } from '@/components/sprite-manager';
import { EXPRESSION_EVENT } from '@/lib/slash-media';

// 沉浸模式左侧的「画廊」（只在沉浸、≥1200px 时显示）：
// 按出现顺序收集这段故事里的插图（卡里 HTML 的大图、生成的图片、单行 Markdown 图片），同一张只收一次；
// 第一格是角色立绘。插图本身仍在消息里正常显示，画廊只是汇总。
// 读到哪张，哪张加一圈强调色；点开看大图，可前后翻、跳回原文。
// 右边缘可拖动调宽（双击恢复默认、方向键微调），可收成窄条，选择记在 localStorage。

type Item = { src: string; msgId: string | null };

const READ_LINE = 0.55; // 视口高度的这个位置以上算「已读到」

function key(src: string): string {
  // 去重：忽略 hash，统一成绝对地址
  try { const url = new URL(src, location.href); url.hash = ''; return url.href; } catch { return src; }
}

function messageImages(msg: Element): string[] {
  const out: string[] = [];
  msg.querySelectorAll<HTMLImageElement>('figure img').forEach((img) => { if (img.src) out.push(img.src); });
  msg.querySelectorAll<HTMLIFrameElement>('iframe.rp-html-frame[data-images]').forEach((frame) => {
    try { for (const src of JSON.parse(frame.dataset.images || '[]') as string[]) out.push(src); } catch { /* 坏数据忽略 */ }
  });
  return out;
}

export function ChatStage({ cover: coverProp, name, characterId, sprites = {} }: { cover: string | null; name: string; characterId: string; sprites?: SpriteMap }) {
  const router = useRouter();
  const cover = coverProp || pickSprite(sprites, 'neutral')?.src || '';
  const [expr, setExpr] = useState<{ label: ExpressionLabel; src: string } | null>(null);
  const [managing, setManaging] = useState(false);
  const hasSprites = Object.keys(sprites).length > 0;
  const spritesRef = useRef(sprites);
  spritesRef.current = sprites;
  const exprCache = useRef(new Map<string, ExpressionLabel>());
  // /expression-set 手动表情：保持到下一条（或被改写的）角色回复为止
  const exprOverride = useRef<{ label: ExpressionLabel; key: string | null } | null>(null);
  useEffect(() => {
    const onSet = (event: Event) => {
      const label = (event as CustomEvent<{ label?: ExpressionLabel }>).detail?.label;
      if (!label) return;
      exprOverride.current = { label, key: null };
      window.dispatchEvent(new Event('tavern:images'));
    };
    window.addEventListener(EXPRESSION_EVENT, onSet);
    return () => window.removeEventListener(EXPRESSION_EVENT, onSet);
  }, []);
  const [state, setState] = useState<'open' | 'rail'>('open');
  const [items, setItems] = useState<Item[]>([{ src: cover, msgId: null }]);
  const [current, setCurrent] = useState<string>(key(cover));
  const [view, setView] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

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
  }, []);

  // 收集插图 + 标出读到的那张
  useEffect(() => {
    let raf = 0;
    // 每条消息的插图缓存；消息内部有变动（流式、iframe 上报）时作废
    let imgCache = new WeakMap<Element, string[]>();
    const compute = () => {
      raf = 0;
      const scroller = document.querySelector<HTMLElement>('.p-chat-scroll');
      if (!scroller) return;
      const line = window.innerHeight * READ_LINE;
      const seen = new Set<string>([key(cover)]);
      const list: Item[] = [{ src: cover, msgId: null }];
      let reading = key(cover);
      let speaking: HTMLElement | null = null;
      const msgs = scroller.getElementsByClassName('p-msg') as HTMLCollectionOf<HTMLElement>;
      // 消息从上到下排列：二分找到阅读线以上的最后一条，不对每条都量位置（长会话 1000+ 楼）
      let lo = 0; let hi = msgs.length - 1; let above = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (msgs[mid].getBoundingClientRect().top < line) { above = mid; lo = mid + 1; } else hi = mid - 1;
      }
      for (let i = above; i >= 0; i -= 1) {
        const msg = msgs[i];
        if (!msg.classList.contains('p-msg-user') && !msg.classList.contains('p-msg-narrator')) { speaking = msg; break; }
      }
      for (let i = 0; i < msgs.length; i += 1) {
        const msg = msgs[i];
        let images = imgCache.get(msg);
        if (!images) { images = messageImages(msg); imgCache.set(msg, images); }
        if (!images.length) continue;
        for (const src of images) {
          const k = key(src);
          if (i <= above) reading = k;
          if (seen.has(k)) continue;
          seen.add(k);
          list.push({ src, msgId: msg.id || null });
        }
      }
      const prev = itemsRef.current;
      if (prev.length !== list.length || prev.some((item, i) => item.src !== list[i].src || item.msgId !== list[i].msgId)) setItems(list);
      setCurrent(reading);
      // 表情立绘：读到的那条角色回复的情绪
      const map = spritesRef.current;
      const last = speaking as HTMLElement | null;
      if (last && Object.keys(map).length) {
        const text = last.querySelector('.p-msg-text')?.textContent ?? '';
        const cacheKey = `${last.id}:${text.length}:${text.slice(-40)}`;
        let label = exprCache.current.get(cacheKey);
        if (!label) { label = classifyExpression(text); exprCache.current.set(cacheKey, label); }
        const manual = exprOverride.current;
        if (manual) {
          if (manual.key === null) manual.key = cacheKey;
          if (manual.key === cacheKey) label = manual.label;
          else exprOverride.current = null;
        }
        const seed = Number(last.id.replace(/\D/g, '')) || 0;
        const pick = pickSprite(map, label, seed);
        setExpr((prev) => (prev?.src === pick?.src && prev?.label === pick?.label ? prev : pick));
      } else setExpr(null);
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(compute); };
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const onImages = () => { imgCache = new WeakMap(); schedule(); };
    window.addEventListener('tavern:images', onImages);
    const scroller = document.querySelector('.p-chat-scroll');
    const mo = scroller ? new MutationObserver((records) => {
      for (const r of records) {
        const node = r.target instanceof Element ? r.target : r.target.parentElement;
        const msg = node?.closest('.p-msg');
        if (msg) imgCache.delete(msg);
      }
      schedule();
    }) : null;
    if (scroller && mo) mo.observe(scroller, { childList: true, subtree: true });
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('tavern:images', onImages);
      mo?.disconnect();
    };
  }, [cover]);

  // 拖动右边缘调宽
  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const root = document.documentElement;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    root.setAttribute('data-chat-stage-drag', '');
    let width = 0;
    const move = (e: PointerEvent) => {
      width = Math.max(STAGE_MIN_W, Math.min(Math.round(window.innerWidth * 0.5), Math.round(e.clientX)));
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
    const now = document.querySelector<HTMLElement>('.chat-stage')?.offsetWidth ?? 400;
    const width = Math.max(STAGE_MIN_W, Math.min(Math.round(window.innerWidth * 0.5), now + (event.key === 'ArrowRight' ? 24 : -24)));
    document.documentElement.style.setProperty('--stage-open-w', `${width}px`);
    try { localStorage.setItem(CHAT_STAGE_W_KEY, String(width)); } catch { /* 隐私模式 */ }
  };

  const jump = (item: Item) => {
    setView(null);
    if (!item.msgId) return;
    const el = document.getElementById(item.msgId);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.classList.remove('is-gallery-hit');
    void el.offsetWidth;
    el.classList.add('is-gallery-hit');
    window.setTimeout(() => el.classList.remove('is-gallery-hit'), 1600);
  };

  const illustrations = items.length - 1;
  return (
    <aside className="chat-stage" aria-label="画廊">
      {state === 'open' ? (
        <>
          <div className="chat-gallery-head">
            <div>
              <div className="chat-gallery-title">画廊</div>
              <div className="chat-gallery-sub">{name} · {illustrations ? `${illustrations} 张插图` : '还没有插图'}</div>
            </div>
            <button className="chat-stage-expr-btn" type="button" onClick={() => setManaging(true)} title="表情立绘：按情绪自动切换">表情{hasSprites ? '' : ' +'}</button>
            <button className="chat-stage-fold" type="button" onClick={() => setMode('rail')} title="收起画廊" aria-label="收起画廊">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
            </button>
          </div>
          <div className="chat-gallery-grid">
            {items.map((item, index) => index === 0 && !item.src && !expr ? (
              // 没有封面也没有表情立绘：显示首字占位，点开去上传表情立绘，不留一块空白
              <button key="__no-cover" type="button" className="chat-gallery-tile is-cover is-empty" onClick={() => setManaging(true)} aria-label="还没有立绘，点此添加表情立绘">
                <span className="chat-gallery-ph" aria-hidden="true">{Array.from(name.trim())[0] || '?'}</span>
                <span className="chat-gallery-ph-tip">还没有立绘 · 点此添加</span>
              </button>
            ) : (
              <button key={key(item.src)} type="button" className={`chat-gallery-tile${key(item.src) === current ? ' is-current' : ''}${index === 0 ? ' is-cover' : ''}`}
                onClick={() => setView(index)} aria-label={index === 0 ? '查看立绘' : `查看第 ${index} 张插图`}>
                <img src={index === 0 && expr ? expr.src : item.src} alt="" loading={index === 0 ? undefined : "lazy"} className={index === 0 && expr ? 'is-sprite' : undefined} key={index === 0 && expr ? expr.src : undefined} />
                {index === 0 && <span className="chat-gallery-badge">{expr ? `立绘 · ${EXPRESSION_ZH[expr.label]}` : '立绘'}</span>}
              </button>
            ))}
            {!illustrations && <p className="chat-gallery-empty">故事里出现的插图会收在这里，同一张只收一次。</p>}
          </div>
          <div className="chat-stage-grip" role="separator" aria-orientation="vertical" aria-label="拖动调整画廊宽度（双击恢复默认）"
            tabIndex={0} onPointerDown={onDrag} onDoubleClick={resetWidth} onKeyDown={nudge} />
        </>
      ) : (
        <button className="chat-stage-rail" type="button" onClick={() => setMode('open')} title="展开画廊" aria-label="展开画廊">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
          <span className="chat-stage-rail-label">画廊</span>
          {illustrations > 0 && <span className="chat-stage-rail-count">{illustrations}</span>}
        </button>
      )}
      {managing && <SpriteManager characterId={characterId} onClose={() => setManaging(false)} onChange={() => router.refresh()} />}
      {view !== null && items[view] && (
        <Lightbox items={items} min={items[0]?.src ? 0 : 1} index={view} onIndex={setView} onClose={() => setView(null)} onJump={jump} />
      )}
    </aside>
  );
}

function Lightbox({ items, min = 0, index, onIndex, onClose, onJump }: {
  items: Item[]; min?: number; index: number; onIndex: (i: number) => void; onClose: () => void; onJump: (item: Item) => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft' && index > min) onIndex(index - 1);
      else if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [index, min, items.length, onClose, onIndex]);
  const item = items[index];
  return createPortal(
    <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label="查看插图" onClick={onClose}>
      <img src={item.src} alt={index === 0 ? '角色立绘' : `第 ${index} 张插图`} onClick={(e) => e.stopPropagation()} />
      <div className="chat-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" disabled={index <= min} onClick={() => onIndex(index - 1)} aria-label="上一张">‹</button>
        <span>{index === 0 ? '立绘' : `${index} / ${items.length - 1}`}</span>
        <button type="button" disabled={index >= items.length - 1} onClick={() => onIndex(index + 1)} aria-label="下一张">›</button>
        {item.msgId && <button type="button" className="chat-lightbox-jump" onClick={() => onJump(item)}>跳到原文</button>}
        <button type="button" ref={closeRef} onClick={onClose} aria-label="关闭">✕</button>
      </div>
    </div>,
    document.body,
  );
}
