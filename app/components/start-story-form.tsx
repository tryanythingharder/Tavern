'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { startStory } from '@/app/c/[id]/actions';
import { Select } from '@/components/ui-select';

type Persona = { id: number; name: string };
type Opening = { id: string; title: string; text: string };

export function StartStoryForm({
  characterId,
  personas,
  defaultPersonaId,
  openings,
  recentChatId,
  lowBalance = false,
}: {
  characterId: string;
  personas: Persona[];
  defaultPersonaId?: number;
  openings: Opening[];
  recentChatId: number | null;
  lowBalance?: boolean;
}) {
  const [openingId, setOpeningId] = useState(openings[0]?.id ?? 'default');
  const formId = `start-${useId().replace(/:/g, '')}`;
  const actsRef = useRef<HTMLDivElement>(null);
  // 主按钮常在首屏以下：它不在视口里、且还没滚过它时，底部浮一条同样的按钮
  const [floating, setFloating] = useState(false);
  useEffect(() => {
    const el = actsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      setFloating(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    }, { rootMargin: '0px 0px -72px 0px' }); // 手机底部标签栏会盖住按钮
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const startLabel = openings.length > 1 ? '用这个开场开始新故事' : '开始新故事';

  return (
    <form id={formId} action={startStory.bind(null, characterId)} style={{ display: 'grid', gap: 10 }}>
      {personas.length > 0 && (
        <label className="small" style={{ display: 'grid', gap: 6 }}>
          以谁的身份进入
          <Select className="select" name="personaId" defaultValue={defaultPersonaId ?? ''}>
            {!defaultPersonaId && <option value="">不用身份（用账号昵称）</option>}
            {personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
          </Select>
        </label>
      )}

      {openings.length > 1 && (() => {
        const index = Math.max(0, openings.findIndex((opening) => opening.id === openingId));
        const current = openings[index];
        const step = (delta: number) => setOpeningId(openings[(index + delta + openings.length) % openings.length].id);
        return (
          <div className="op-pick" role="group" aria-label="选择开场">
            <div className="op-pick-head">
              <span className="small">选择你的开场 · {index + 1}/{openings.length}</span>
              <span className="op-pick-nav">
                <button type="button" aria-label="上一个开场" onClick={() => step(-1)}>‹</button>
                <button type="button" aria-label="下一个开场" onClick={() => step(1)}>›</button>
              </span>
            </div>
            <div
              className="op-pick-card"
              aria-live="polite"
              onTouchStart={(event) => { (event.currentTarget as HTMLElement).dataset.x = String(event.touches[0].clientX); }}
              onTouchEnd={(event) => {
                const x0 = Number((event.currentTarget as HTMLElement).dataset.x);
                const dx = event.changedTouches[0].clientX - x0;
                if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
              }}
            >
              <b className="op-pick-title">{current.title}</b>
              <p className="op-pick-text">{current.text}</p>
            </div>
            <div className="op-pick-dots" aria-hidden="true">
              {openings.map((opening) => <i key={opening.id} className={opening.id === openingId ? 'is-on' : ''} />)}
            </div>
          </div>
        );
      })()}
      <input type="hidden" name="openingId" value={openingId} />

      <div ref={actsRef} data-start-acts style={{ display: 'grid', gap: 10 }}>
      {lowBalance ? (
        <div className="p-notice" style={{ margin: 0 }}>
          <div className="p-notice-main">
            <div className="p-notice-title">点数不足</div>
            <div>先签到领 10 点，或用兑换码/充值后再开始故事。</div>
          </div>
          <Link className="p-btn p-btn--sm p-btn--primary" href="/me/points">去领点数</Link>
        </div>
      ) : recentChatId ? (
        <>
          <Link className="p-btn p-btn--primary p-btn--block" href={`/chats/${recentChatId}`}>继续最近对话</Link>
          <button className="p-btn p-btn--block" type="submit">{startLabel}</button>
        </>
      ) : (
        <button className="p-btn p-btn--primary p-btn--block" type="submit">{startLabel}</button>
      )}
      </div>
      {floating && !lowBalance && createPortal(
        <div className="p-start-float">
          {recentChatId
            ? <Link className="p-btn p-btn--primary" href={`/chats/${recentChatId}`}>继续最近对话</Link>
            : <button className="p-btn p-btn--primary" type="submit" form={formId}>{startLabel}</button>}
        </div>,
        document.body,
      )}
    </form>
  );
}
