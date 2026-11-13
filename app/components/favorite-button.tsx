'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function FavoriteButton({ characterId, initial }: { characterId: string; initial: boolean }) {
  const [favorite, setFavorite] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ favorite: boolean }>(`/api/characters/${characterId}/favorite`, {
        method: 'POST',
        body: JSON.stringify({ favorite: !favorite }),
      });
      setFavorite(result.favorite);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn" type="button" aria-pressed={favorite} disabled={busy} onClick={() => void toggle()} title={error || undefined}>
      {favorite ? '★ 已收藏' : '☆ 收藏'}
    </button>
  );
}
