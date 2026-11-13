'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/components/settings-ui';
import { coverSrc } from '@/components/proto-cover';

export type WorkCharacter = {
  id: string; name: string; author: string; initial: string; hue: number;
  hook: string; chats: string; category: string; ownerId: number | null; coverImage: string | null;
};

// 原型作品卡：p-card p-work
export function ProtoWorkCard({ character }: { character: WorkCharacter }) {
  const src = coverSrc(character);
  const [favorite, setFavorite] = useState(false);

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    try {
      await api(`/api/characters/${character.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: next }) });
    } catch {
      setFavorite(!next);
    }
  };

  return (
    <article className="p-card p-work" data-character={character.id}>
      <div className="p-work-media">
        <Link
          className={`p-work-cover p-cover${src ? ' has-portrait' : ''}`}
          style={{ ['--h' as string]: character.hue }}
          data-initial={character.initial}
          href={`/c/${character.id}`}
          aria-label={`查看${character.name}`}
        >
          {src && <img src={src} alt="" loading="lazy" />}
        </Link>
        <button className="p-work-fav" type="button" aria-pressed={favorite} aria-label={favorite ? `取消收藏${character.name}` : `收藏${character.name}`} onClick={() => void toggleFavorite()}>
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4S4 15.4 4 9.9A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 5.5-8 10.5-8 10.5z" /></svg>
        </button>
      </div>
      <div className="p-work-body">
        <Link className="p-card-link" href={`/c/${character.id}`}>
          <h3 className="p-work-name">{character.name}</h3>
          <p className="p-work-author">@{character.author}</p>
          <p className="p-work-desc">{character.hook}</p>
        </Link>
        <div className="p-work-meta">
          <span className="p-pill p-pill--sm p-pill--outline">{character.category}</span>
          <span className="p-work-stat">{character.chats} 人聊过</span>
        </div>
      </div>
    </article>
  );
}
