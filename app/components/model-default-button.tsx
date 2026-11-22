'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function ModelDefaultButton({ model, active }: { model: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async (value: string) => {
    setBusy(true);
    setError('');
    try {
      await api('/api/me/default-model', { method: 'PUT', body: JSON.stringify({ model: value }) });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="mg-pick">
      {active ? (
        <>
          <span className="p-pill p-pill--sm p-pill--ok">我的默认</span>
          <button className="p-text-btn" type="button" disabled={busy} onClick={() => void pick('')}>取消</button>
        </>
      ) : (
        <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={() => void pick(model)}>{busy ? '设置中…' : '设为默认'}</button>
      )}
      {error && <span className="p-small" role="alert">{error}</span>}
    </span>
  );
}
