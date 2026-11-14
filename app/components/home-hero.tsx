'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { coverSrc, type CoverItem } from '@/components/proto-cover';

type HeroCharacter = CoverItem & { author: string; hook: string; chats: string; category?: string };

// 发现页主视觉：精选角色轮播。立绘缓慢推镜，文字分层入场；悬停暂停，支持键盘与滑动。
export function HomeHero({ characters, greeting, sub }: { characters: HeroCharacter[]; greeting: string; sub: string }) {
  const list = characters.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = list.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.dataset.uMotion === 'off') return;
    const timer = setTimeout(() => go(index + 1), 6500);
    return () => clearTimeout(timer);
  }, [index, paused, count, go]);

  if (!count) return null;
  const current = list[index];

  return (
    <section
      className="rd-hero"
      aria-roledescription="carousel"
      aria-label="精选角色"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        if (touchX.current === null) return;
        const dx = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(index + 1);
        if (event.key === 'ArrowLeft') go(index - 1);
      }}
    >
      <div className="rd-hero-stage" aria-live="polite">
        {list.map((character, i) => {
          const src = coverSrc(character);
          return (
            <div
              key={character.id}
              className={`rd-hero-slide${i === index ? ' is-active' : ''}`}
              style={{ ['--h' as string]: character.hue }}
              aria-hidden={i !== index}
            >
              {src ? <img src={src} alt="" /> : <span className="rd-hero-initial">{character.initial}</span>}
            </div>
          );
        })}
        <div className="rd-hero-shade" />
      </div>

      <div className="rd-hero-copy" key={current.id}>
        <p className="rd-hero-greet">{greeting}<span>{sub}</span></p>
        <div className="rd-hero-tag">
          {current.category && <span>{current.category}</span>}
          <span>{current.chats} 人聊过</span>
        </div>
        <h2 className="rd-hero-name">{current.name}</h2>
        <p className="rd-hero-hook">{current.hook}</p>
        <div className="rd-hero-actions">
          <Link className="rd-hero-cta" href={`/c/${current.id}`}>
            <span>开始这段故事</span>
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <span className="rd-hero-author">由 @{current.author} 创建</span>
        </div>
      </div>

      {count > 1 && (
        <div className="rd-hero-dots" role="tablist" aria-label="切换精选角色">
          {list.map((character, i) => (
            <button
              key={character.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={character.name}
              className={i === index && !paused ? 'is-running' : ''}
              onClick={() => go(i)}
            >
              <i />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
