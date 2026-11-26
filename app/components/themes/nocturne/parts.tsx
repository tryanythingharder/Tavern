'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { pad2 } from '@/components/themes/nocturne/lib';

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 走动的时间码（24 帧）。减少动效时静止。 */
export function NocTimecode({ start = 24 * 24 + 12, label = 'TC' }: { start?: number; label?: string }) {
  const [frame, setFrame] = useState(start);
  useEffect(() => {
    if (reduced()) return;
    const timer = window.setInterval(() => setFrame((value) => value + 1), 1000 / 24);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.floor(frame / 24);
  const text = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frame % 24].map(pad2).join(':');
  return (
    <span className="noc-caps noc-tc">
      {label} <b className="noc-latin" suppressHydrationWarning>{text}</b>
    </span>
  );
}

/** 右侧章节导轨：随滚动点亮当前章节 */
export function NocChapterRail({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const item of items) {
      const element = document.getElementById(item.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items]);
  return (
    <nav className="noc-rail" aria-label="章节">
      {items.map((item, index) => (
        <a key={item.id} href={`#${item.id}`} className={active === item.id ? 'is-on' : undefined} aria-current={active === item.id ? 'true' : undefined}>
          <span className="noc-rail-label">{item.label}</span>
          <b className="noc-latin">{pad2(index + 1)}</b>
          <i aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}

type DeckCard = {
  id: string;
  name: string;
  cover: string | null;
  /** 缩略图 + 原图 srcset（内置立绘才有），1x 屏取缩略图 */
  coverSet?: string | null;
  initial: string;
  hook: string;
  category: string;
  author: string;
  nsfw: boolean;
  no: number;
};

/** 3D 扇形海报堆：指针视差倾斜，点侧边的海报换片，点正中的海报进入角色页 */
export function NocDeck({ cards }: { cards: DeckCard[] }) {
  const [active, setActive] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const count = cards.length;
  const go = useCallback((delta: number) => setActive((value) => (value + delta + count) % count), [count]);

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || reduced()) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    stage.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
    stage.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
  };
  const onLeave = () => {
    stageRef.current?.style.setProperty('--ry', '0deg');
    stageRef.current?.style.setProperty('--rx', '0deg');
  };

  return (
    <div className="noc-deck-wrap noc-reveal">
      <div className="noc-stage" ref={stageRef} onPointerMove={onMove} onPointerLeave={onLeave}>
        <div className="noc-floor" aria-hidden="true" />
        <div className="noc-deck">
          {cards.map((card, index) => {
            let pos = index - active;
            if (pos > Math.floor(count / 2)) pos -= count;
            if (pos < -Math.floor((count - 1) / 2)) pos += count;
            const hidden = Math.abs(pos) > 2;
            const inner = (
              <>
                {card.cover ? <img src={card.cover} {...(card.coverSet ? { srcSet: card.coverSet, sizes: '(max-width: 720px) 66vw, 360px' } : {})} alt="" draggable={false} loading="lazy" decoding="async" /> : <span className="noc-card-blank">{card.initial}</span>}
                <span className="noc-sheen" aria-hidden="true" />
                <span className="noc-card-badge noc-latin">Feature {pad2(card.no)}</span>
                <span className="noc-card-rating">{card.nsfw ? 'R18' : '全年龄'}</span>
                <span className="noc-card-meta">
                  <span className="noc-caps">{card.category} · 作者 {card.author}</span>
                  <strong>{card.name}</strong>
                  <span className="noc-card-hook">{card.hook}</span>
                </span>
              </>
            );
            return pos === 0 ? (
              <Link key={card.id} className="noc-card" data-pos={pos} href={`/c/${card.id}`} aria-label={`${card.name}：进入角色页`}>
                {inner}
              </Link>
            ) : (
              <button
                key={card.id}
                type="button"
                className="noc-card"
                data-pos={hidden ? 'hidden' : pos}
                tabIndex={hidden ? -1 : 0}
                aria-label={`切换到 ${card.name}`}
                onClick={() => setActive(index)}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>
      <div className="noc-ctrls">
        <button type="button" onClick={() => go(-1)} aria-label="上一部">←</button>
        <button type="button" onClick={() => go(1)} aria-label="下一部">→</button>
        <span className="noc-count noc-latin"><b>{pad2(active + 1)}</b> / {pad2(count)}</span>
      </div>
    </div>
  );
}

type Poster = {
  id: string;
  name: string;
  author: string;
  category: string;
  pace: string;
  chats: string;
  nsfw: boolean;
  hook: string;
  greeting: string;
  cover: string | null;
  /** 缩略图 + 原图 srcset（内置立绘才有），1x 屏取缩略图 */
  coverSet?: string | null;
  initial: string;
  no: number;
};

/** 片单：分类筛选 + 悬停揭示开场白 */
export function NocProgramme({ categories, items }: { categories: string[]; items: Poster[] }) {
  const [filter, setFilter] = useState('全部');
  const shown = filter === '全部' ? items : items.filter((item) => item.category === filter);
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  return (
    <>
      <div className="noc-ph">
        <div>
          <div className="noc-chap noc-reveal"><span className="noc-chap-n noc-latin">03</span><span className="noc-chap-rule" /><span className="noc-caps">片单 · The Programme</span></div>
          <h2 className="noc-reveal">全部片单<span className="noc-latin">{words[items.length] ?? items.length} features</span></h2>
        </div>
        <div className="noc-filters" role="tablist" aria-label="按类型筛选">
          {['全部', ...categories].map((category) => (
            <button key={category} type="button" role="tab" aria-selected={filter === category} className={filter === category ? 'is-on' : undefined} onClick={() => setFilter(category)}>
              {category}
            </button>
          ))}
        </div>
      </div>
      {shown.length ? (
        <div className="noc-grid">
          {shown.map((item) => (
            <Link key={item.id} className="noc-poster noc-reveal" href={`/c/${item.id}`} style={{ ['--d' as string]: (item.no - 1) % 3 } as CSSProperties}>
              <div className="noc-frame">
                {item.cover ? <img src={item.cover} {...(item.coverSet ? { srcSet: item.coverSet, sizes: '(max-width: 720px) 46vw, 400px' } : {})} alt="" loading="lazy" decoding="async" /> : <span className="noc-poster-blank">{item.initial}</span>}
                <span className="noc-no noc-latin">No. {pad2(item.no)}</span>
                {item.nsfw && <span className="noc-r18">R18</span>}
                <p className="noc-hook">{item.hook}</p>
                <p className="noc-greet"><span className="noc-greet-k">开场白</span>{item.greeting}</p>
              </div>
              <div className="noc-cap">
                <h3>{item.name}</h3>
                <span className="noc-by">作者 <b>{item.author}</b></span>
              </div>
              <div className="noc-sub">
                <span>{item.category}</span>
                {item.pace && <span>{item.pace}</span>}
                <span>{item.chats} 人次</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="noc-empty">这个类型今夜没有排片。</p>
      )}
    </>
  );
}
