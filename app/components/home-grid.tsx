'use client';

import { useState } from 'react';
import { ProtoWorkCard, type WorkCharacter } from '@/components/proto-work-card';
import { ALL, CATEGORIES } from '@/lib/catalog';

type Item = WorkCharacter;
const TAGS = [ALL, ...CATEGORIES];

export function HomeGrid({ characters }: { characters: Item[] }) {
  const [filter, setFilter] = useState('全部');
  const list = filter === '全部' ? characters : characters.filter((item) => item.category === filter);
  return (
    <>
      <div className="ca-chips" aria-label="角色题材">
        {TAGS.map((tag) => (
          <button key={tag} className="ca-chip" type="button" aria-pressed={filter === tag} onClick={() => setFilter(tag)}>{tag}</button>
        ))}
      </div>
      <div className="ca-grid">
        {list.map((character) => <ProtoWorkCard key={character.id} character={character} />)}
        {!list.length && <p className="small">这个分类还没有角色。</p>}
      </div>
    </>
  );
}
