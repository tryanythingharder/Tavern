'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { StageArt, type ArtCharacter } from '@/components/themes/stage/art';

export type DeckCard = ArtCharacter & { hook: string };

// 抽一张：洗牌动画 → 顶牌翻面，翻出来的角色可直接点进去
export function DeckDraw({ cards, initial = 0 }: { cards: DeckCard[]; initial?: number }) {
  const [index, setIndex] = useState(Math.min(initial, Math.max(cards.length - 1, 0)));
  const [phase, setPhase] = useState<'show' | 'shuffle'>('show');
  const timer = useRef<number | undefined>(undefined);
  const card = cards[index];

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function shuffle() {
    if (cards.length < 2 || phase === 'shuffle') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let next = index;
    while (next === index) next = Math.floor(Math.random() * cards.length);
    setPhase('shuffle');
    timer.current = window.setTimeout(() => {
      setIndex(next);
      setPhase('show');
    }, reduce ? 0 : 900);
  }

  if (!card) return null;

  return (
    <article className="stg-tile stg-deck stg-rise" style={{ animationDelay: '.35s' }}>
      <span className="stg-lab">不知道演谁？</span>
      <h3>抽一张</h3>
      <p>让今晚由命运开场</p>
      <div className={`stg-stack is-${phase}`}>
        {[0, 1, 2].map((i) => (
          <div className="stg-dc" key={i} aria-hidden="true">
            <div className="stg-dc-f"><em>夜</em><small>YEHUA</small></div>
          </div>
        ))}
        <Link className="stg-dc stg-dc--top" href={`/c/${card.id}`} aria-label={`抽到：${card.name}，去看看`} tabIndex={phase === 'show' ? 0 : -1}>
          <div className="stg-dc-f" aria-hidden="true"><em>夜</em><small>YEHUA</small></div>
          <div className="stg-dc-b">
            <StageArt character={card} />
            <span>{card.name}</span>
          </div>
        </Link>
      </div>
      <button className="stg-shuffle" type="button" onClick={shuffle} disabled={cards.length < 2} aria-live="polite">
        <span aria-hidden="true">↻</span> {phase === 'shuffle' ? '洗牌中…' : '洗牌抽卡'}
      </button>
    </article>
  );
}
