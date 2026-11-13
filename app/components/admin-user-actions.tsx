'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

export function AdminUserActions({ id, nickname, status, role }: { id: number; nickname: string; status: string; role: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [nextRole, setNextRole] = useState(role);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (key: string, fn: () => Promise<unknown>, message: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await fn();
      setNotice(message);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const grant = () => run('grant', () => api('/api/admin/grant', {
    method: 'POST',
    body: JSON.stringify({ userId: id, amount: Number(amount), note }),
  }), '点数已调整。');

  const toggleBan = () => run('ban', () => api(`/api/admin/users/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: status === 'banned' ? 'active' : 'banned' }),
  }), status === 'banned' ? '已解封。' : '已封禁并让所有会话失效。');

  const changeRole = () => run('role', () => api(`/api/admin/users/${id}/role`, {
    method: 'POST',
    body: JSON.stringify({ role: nextRole }),
  }), '角色已更新。');

  return (
    <section className="p-card p-card--pad">
      <h2 className="p-form-section-title">操作 · {nickname}</h2>
      <ErrorLine message={error} />
      {notice && <p className="admin-toast" role="status">{notice}</p>}
      <div className="p-field-row" style={{ alignItems: 'flex-end' }}>
        <div className="p-field">
          <label htmlFor="admin-grant-amount">调整点数（负数为扣减）</label>
          <input id="admin-grant-amount" className="p-input" type="number" value={amount} placeholder="例如 100 或 -50" onChange={(event) => setAmount(event.target.value)} />
        </div>
        <div className="p-field">
          <label htmlFor="admin-grant-note">备注</label>
          <input id="admin-grant-note" className="p-input" value={note} maxLength={60} placeholder="赠点 / 补偿 / 扣回" onChange={(event) => setNote(event.target.value)} />
        </div>
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'grant' || !Number(amount)} onClick={() => void grant()}>
          {busy === 'grant' ? '处理中…' : '确认调整'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <select className="p-select" aria-label="账号角色" value={nextRole} onChange={(event) => setNextRole(event.target.value)} style={{ width: 130 }}>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>
        <button className="p-btn p-btn--sm" type="button" disabled={busy === 'role' || nextRole === role} onClick={() => void changeRole()}>
          {busy === 'role' ? '更新中…' : '更新角色'}
        </button>
        <button className={`p-btn p-btn--sm ${status === 'banned' ? '' : 'p-btn--danger'}`} type="button" disabled={busy === 'ban' || status === 'deleted'} onClick={() => void toggleBan()}>
          {busy === 'ban' ? '处理中…' : status === 'banned' ? '解封账号' : status === 'deleted' ? '已注销' : '封禁账号'}
        </button>
      </div>
    </section>
  );
}
