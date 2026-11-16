'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { StageArt } from '@/components/themes/stage/art';
import { Tilt } from '@/components/themes/stage/tilt';
import { pad2, parseCount, shortPace } from '@/components/themes/stage/util';

export type ShelfCard = {
  id: string;
  no: number;
  name: string;
  initial: string;
  author: string;
  ownerId: number | null;
  coverImage: string | null;
  category: string;
  tags: string[];
  nsfw: boolean;
  chats: string;
  hook: string;
  pace: string;
  createdAt: number;
};

type Filter = { kind: 'all' } | { kind: 'cat' | 'tag'; value: string };

const ROT = ['-3deg', '2deg', '-1deg', '3deg', '-2deg', '4deg', '-3deg', '2deg', '-4deg', '1deg', '-2deg', '3deg', '-1deg', '4deg'];

// 按心情挑（贴纸筛选）+ 卡册（横向卡架）。两者共享筛选状态，所以放在一个客户端组件里。
export function StageCollection({ cards, categories }: { cards: ShelfCard[]; categories: string[] }) {
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const shelfRef = useRef<HTMLDivElement>(null);

  const catCounts = useMemo(
    () => categories.map((cat) => ({ cat, n: cards.filter((card) => card.category === cat).length })).filter((item) => item.n > 0),
    [cards, categories],
  );
  const tags = useMemo(() => {
    const seen = new Map<string, number>();
    for (const card of cards) for (const tag of card.tags) if (!categories.includes(tag)) seen.set(tag, (seen.get(tag) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag);
  }, [cards, categories]);

  const shown = useMemo(() => {
    const list = cards.filter((card) => {
      if (filter.kind === 'cat') return card.category === filter.value;
      if (filter.kind === 'tag') return card.tags.includes(filter.value);
      return true;
    });
    return [...list].sort((a, b) => (sort === 'hot' ? parseCount(b.chats) - parseCount(a.chats) : b.createdAt - a.createdAt || a.no - b.no));
  }, [cards, filter, sort]);

  const is = (kind: Filter['kind'], value?: string) => filter.kind === kind && (kind === 'all' || (filter as { value: string }).value === value);
  const pick = (next: Filter) => {
    setFilter(next);
    shelfRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };
  const scrollBy = (dir: number) => shelfRef.current?.scrollBy({ left: dir * 322, behavior: 'smooth' });

  let r = 0;
  const rot = () => ROT[r++ % ROT.length];

  return (
    <>
      <section className="stg-moods" aria-label="按心情挑">
        <div className="stg-moods-head"><b>按心情挑</b><span className="stg-ital">pick by mood</span></div>
        <div className="stg-stickers">
          <button type="button" className={`stg-st${is('all') ? ' is-on' : ''}`} style={{ ['--rot' as string]: rot() }} aria-pressed={is('all')} onClick={() => pick({ kind: 'all' })}>
            全部 <small>{cards.length}</small>
          </button>
          {catCounts.map(({ cat, n }) => (
            <button key={cat} type="button" className={`stg-st${is('cat', cat) ? ' is-on' : ''}`} style={{ ['--rot' as string]: rot() }} aria-pressed={is('cat', cat)} onClick={() => pick(is('cat', cat) ? { kind: 'all' } : { kind: 'cat', value: cat })}>
              {cat} <small>{n}</small>
            </button>
          ))}
          {tags.map((tag, i) => {
            const variant = i % 5 === 0 ? ' stg-st--dark' : i % 5 === 2 ? ' stg-st--soft' : '';
            return (
              <button key={tag} type="button" className={`stg-st${is('tag', tag) ? ' is-on' : variant}`} style={{ ['--rot' as string]: rot() }} aria-pressed={is('tag', tag)} onClick={() => pick(is('tag', tag) ? { kind: 'all' } : { kind: 'tag', value: tag })}>
                <span className="stg-hash">#</span>{tag}
              </button>
            );
          })}
        </div>
      </section>

      <section className="stg-shelf-sec" id="stg-shelf" aria-label="卡册">
        <div className="stg-shelf-h">
          <h2>卡册<span className="stg-cnt">{pad2(shown.length)}</span><span className="stg-ital">the collection, vol.1</span></h2>
          <div className="stg-shelf-ctl">
            <div className="stg-seg" role="group" aria-label="排序">
              <button type="button" className={sort === 'hot' ? 'is-on' : ''} aria-pressed={sort === 'hot'} onClick={() => setSort('hot')}>热门</button>
              <button type="button" className={sort === 'new' ? 'is-on' : ''} aria-pressed={sort === 'new'} onClick={() => setSort('new')}>最新</button>
              <Link href="/library">已收藏</Link>
            </div>
            <div className="stg-arrows">
              <button type="button" aria-label="向左翻" onClick={() => scrollBy(-1)}>←</button>
              <button type="button" aria-label="向右翻" onClick={() => scrollBy(1)}>→</button>
            </div>
          </div>
        </div>
        <div className="stg-shelf" ref={shelfRef}>
          {shown.map((card, i) => (
            <div className="stg-cc stg-rise" key={card.id} style={{ animationDelay: `${0.08 + Math.min(i, 8) * 0.06}s`, ['--rot' as string]: i % 2 ? '1deg' : '-1.2deg', ['--lift' as string]: i % 2 ? '12px' : '0px' }}>
              <Tilt className="stg-cc-tilt">
                <Link className="stg-cc-in" href={`/c/${card.id}`} aria-label={`${card.name}，${card.hook}`}>
                  <div className="stg-cc-ph">
                    <StageArt character={card} />
                    <div className="stg-cc-no">NO.{pad2(card.no)}<b>{card.category}</b></div>
                    <div className="stg-cc-cnt"><span aria-hidden="true">◔</span> {card.chats} 次开场</div>
                    {card.nsfw && <span className="stg-r18">18+</span>}
                  </div>
                  <div className="stg-cc-body">
                    <div className="stg-cc-nm"><b>{card.name}</b><span className="stg-ital">by {card.author}</span></div>
                    <p className="stg-cc-hook">{card.hook}</p>
                    <div className="stg-cc-tg">{card.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
                    <div className="stg-cc-ft">
                      <small>节奏<b>{shortPace(card.pace)}</b></small>
                      <span className="stg-open">开场 <span aria-hidden="true">→</span></span>
                    </div>
                  </div>
                  <span className="stg-glare" aria-hidden="true" />
                </Link>
              </Tilt>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="stg-cc stg-cc--empty">
              <div className="stg-cc-in">
                <b>这个心情下还没有角色</b>
                <button type="button" className="stg-btn stg-btn--ghost" onClick={() => pick({ kind: 'all' })}>看看全部</button>
              </div>
            </div>
          )}
          <div className="stg-cc stg-cc--new">
            <Link className="stg-cc-in" href="/create">
              <span className="stg-plus" aria-hidden="true">＋</span>
              <b>写下第 {cards.length + 1} 张</b>
              <p>从一句开场白开始，<br />捏一个属于你的角色。</p>
              <span className="stg-btn stg-btn--ink">开始创作</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
