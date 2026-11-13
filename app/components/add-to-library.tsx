'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function AddToLibraryButton({ characterId, initialAdded }: { characterId: string; initialAdded: boolean }) {
  const router = useRouter();
  const [added, setAdded] = useState(initialAdded);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (added) {
    return <span className="p-small">已在角色库</span>;
  }

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/characters/${characterId}/added`, { method: 'POST', body: JSON.stringify({ added: true }) });
      setAdded(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="p-notice-actions">
      <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={() => void add()}>
        {busy ? '添加中…' : '添加到角色库'}
      </button>
      {error && <span className="p-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </span>
  );
}
