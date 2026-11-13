'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function WorkActions({ characterId, status }: { characterId: string; status: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const remove = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ archived: boolean }>(`/api/characters/${characterId}`, { method: 'DELETE' });
      setConfirming(false);
      setMessage(result.archived ? '有会话在用，已下架并保留历史' : '已删除');
      router.refresh();
    } catch (caught) {
      setMessage((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-library-actions">
      <span className={`p-pill p-pill--sm ${status === 'pending' ? 'p-pill--warn' : status === 'published' ? 'p-pill--ok' : 'p-pill--outline'}`}>
        {status === 'pending' ? '待审核' : status === 'published' ? '已发布' : status === 'draft' ? '草稿' : '已下架'}
      </span>
      <Link className="p-btn p-btn--sm" href={`/c/${characterId}`}>查看</Link>
      <Link className="p-btn p-btn--sm" href={`/create?edit=${characterId}`}>继续编辑</Link>
      <a className="p-btn p-btn--sm" href={`/api/characters/${characterId}/export`} download>导出卡</a>
      {confirming ? (
        <>
          <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</button>
          <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirming(false)}>取消</button>
        </>
      ) : (
        <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirming(true)}>删除</button>
      )}
      {message && <span className="p-small">{message}</span>}
    </div>
  );
}
