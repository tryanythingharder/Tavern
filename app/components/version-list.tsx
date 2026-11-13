'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Version = { id: number; revision: number; createdAt: number; snapshot: { name?: string; hook?: string } };

export function VersionList({ characterId, versions }: { characterId: string; versions: Version[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const restore = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/characters/${characterId}/versions/${id}/restore`, { method: 'POST' });
      // 表单是客户端状态，恢复后整页刷新才能看到旧内容
      window.location.reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="p-card p-card--pad" style={{ marginTop: 20 }}>
      <h2 className="p-form-section-title">作品版本</h2>
      <p className="p-small">每次保存前留一版，最多保留 5 版；恢复会以那一版内容覆盖当前草稿，并把当前状态也留一版。</p>
      <ErrorLine message={error} />
      <div className="p-rows">
        {versions.map((version) => (
          <div className="p-room-card" key={version.id} style={{ padding: '12px 16px' }}>
            <div className="p-room-main">
              <div className="p-room-title">
                <span>v{version.revision} · {version.snapshot.name ?? '未命名'}</span>
                <span className="p-pill p-pill--sm p-pill--outline">{new Date(version.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <p className="p-room-last">{version.snapshot.hook ?? ''}</p>
            </div>
            <div className="p-library-actions">
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === version.id} onClick={() => void restore(version.id)}>
                {busyId === version.id ? '恢复中…' : '恢复这一版'}
              </button>
            </div>
          </div>
        ))}
        {!versions.length && <p className="p-small">还没有历史版本。修改并保存后会生成第一版。</p>}
      </div>
    </section>
  );
}
