'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Status = { todayDone: boolean; streak: number; amount: number };

export function CheckinCard({ initial }: { initial: Status }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const claim = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ amount: number; streak: number; balance: number }>('/api/checkin', { method: 'POST' });
      setStatus({ todayDone: true, streak: result.streak, amount: 0 });
      setNotice(`签到成功，+${result.amount} 点，当前余额 ${result.balance}`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-card p-card--pad">
      <h2 className="p-form-section-title">每日签到</h2>
      <p className="p-small">
        {status.todayDone ? `今天已签到 · 连续 ${status.streak} 天` : `连续 ${status.streak} 天可领 ${status.amount} 点（基础 10 点，连续每天 +2，最多 +14）`}
      </p>
      <button className="p-btn p-btn--primary" type="button" disabled={busy || status.todayDone} onClick={() => void claim()} style={{ marginTop: 10 }}>
        {status.todayDone ? '今天已签到' : busy ? '签到中…' : '签到'}
      </button>
      <ErrorLine message={error} />
      {notice && <p className="p-small" role="status" style={{ margin: '8px 0 0' }}>{notice}</p>}
    </section>
  );
}
