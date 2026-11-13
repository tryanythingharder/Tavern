'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function CharacterOwnerActions({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ archived: boolean }>(`/api/characters/${characterId}`, { method: 'DELETE' });
      if (result.archived) {
        // 还有会话在用：从广场下架但保留数据
        router.push('/create');
      } else {
        router.push('/plaza');
      }
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      <a className="btn btn--sm" href={`/create?edit=${characterId}`}>编辑角色</a>
      {confirming ? (
        <>
          <button className="btn btn--sm btn--danger" type="button" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</button>
          <button className="btn btn--sm btn--ghost" type="button" onClick={() => setConfirming(false)}>取消</button>
        </>
      ) : (
        <button className="btn btn--sm btn--ghost" type="button" onClick={() => setConfirming(true)}>删除</button>
      )}
      {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
