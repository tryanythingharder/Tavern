'use client';

import Link from 'next/link';
import { useState } from 'react';
import { startStory } from '@/app/c/[id]/actions';

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

  return (
    <form action={startStory.bind(null, characterId)} style={{ display: 'grid', gap: 10 }}>
      {personas.length > 0 && (
        <label className="small" style={{ display: 'grid', gap: 6 }}>
          以谁的身份进入
          <select className="select" name="personaId" defaultValue={defaultPersonaId ?? ''}>
            {personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
          </select>
        </label>
      )}

      {openings.length > 1 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span className="small">选择你的开场</span>
          {openings.map((opening) => (
            <button
              key={opening.id}
              className="opening-choice"
              type="button"
              aria-pressed={openingId === opening.id}
              onClick={() => setOpeningId(opening.id)}
            >
              <span className="opening-title">{opening.title}</span>
              <span className="opening-text">{opening.text.slice(0, 80)}{opening.text.length > 80 ? '…' : ''}</span>
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="openingId" value={openingId} />

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
          <button className="p-btn p-btn--block" type="submit">用选中的开场开始新故事</button>
        </>
      ) : (
        <button className="p-btn p-btn--primary p-btn--block" type="submit">用选中的开场开始新故事</button>
      )}
    </form>
  );
}
