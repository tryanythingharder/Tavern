'use client';

import { useState } from 'react';
import { DateField } from '@/components/ui-date';
import { useRouter } from 'next/navigation';
import { ErrorLine, api } from '@/components/settings-ui';

// 玩家详情：出生日期（玩家只能填一次，填错由这里改）与年龄验证的手动标记
export function AdminUserAge({ id, birthDate, verifiedAt, method }: { id: number; birthDate: string | null; verifiedAt: number | null; method: string | null }) {
  const router = useRouter();
  const [birth, setBirth] = useState(birthDate ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/nsfw', { method: 'PATCH', body: JSON.stringify({ userId: id, ...body }) });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
      <h2 className="p-form-section-title">年龄</h2>
      <ErrorLine message={error} />
      <div className="p-field-row" style={{ alignItems: 'flex-end' }}>
        <div className="p-field">
          <label htmlFor="admin-user-birth">出生日期</label>
          <DateField id="admin-user-birth" value={birth} aria-label="出生日期" onChange={setBirth} />
        </div>
        <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={() => void send({ birthDate: birth || null })}>保存</button>
      </div>
      <p className="p-small" style={{ marginTop: 10 }}>
        年龄验证：{verifiedAt ? `已通过（${method ?? '—'}）` : '未通过'}{' '}
        <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={() => void send({ verified: !verifiedAt })}>{verifiedAt ? '撤销' : '手动标记已验证'}</button>
      </p>
    </section>
  );
}
