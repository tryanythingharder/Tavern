'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';
import { confirmAction, toast } from '@/components/admin-feedback';

type AdminUser = {
  id: number; email: string; nickname: string; role: string; status: string;
  createdAt: number | null; balance: number; tokensToday: number; runsToday: number;
};

export function AdminPanel({ users }: { users: AdminUser[] }) {
  const [rows, setRows] = useState(users);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  const toggleBan = async (row: AdminUser) => {
    const next = row.status === 'banned' ? 'active' : 'banned';
    if (next === 'banned' && !(await confirmAction({ title: '封禁账号？', message: `「${row.nickname}」将无法登录，所有登录设备立即下线。`, confirmLabel: '封禁', danger: true }))) return;
    setBusyId(row.id);
    setError('');
    try {
      await api(`/api/admin/users/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: next } : item)));
      toast.ok(next === 'banned' ? `已封禁「${row.nickname}」` : `已解封「${row.nickname}」`);
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const grant = async (userId: number) => {
    const amount = Number(amounts[userId] ?? 100);
    if (!Number.isFinite(amount) || amount === 0) {
      setError('点数要填一个非零数字');
      return;
    }
    const target = rows.find((row) => row.id === userId);
    if (amount < 0 && !(await confirmAction({ title: '扣减点数？', message: `将从「${target?.nickname ?? userId}」的余额里扣掉 ${-amount} 点。`, confirmLabel: `扣减 ${-amount} 点`, danger: true }))) return;
    if (amount >= 10000 && !(await confirmAction({ title: '大额赠点', message: `将给「${target?.nickname ?? userId}」赠送 ${amount.toLocaleString('zh-CN')} 点，确认金额无误？`, confirmLabel: '确认赠送' }))) return;
    setBusyId(userId);
    setError('');
    try {
      const { balance } = await api<{ balance: number }>('/api/admin/grant', {
        method: 'POST',
        body: JSON.stringify({ userId, amount, note: notes[userId] ?? '' }),
      });
      setRows((prev) => prev.map((row) => (row.id === userId ? { ...row, balance } : row)));
      setAmounts((prev) => ({ ...prev, [userId]: '' }));
      setNotes((prev) => ({ ...prev, [userId]: '' }));
      toast.ok(`${amount > 0 ? '已赠送' : '已扣减'} ${Math.abs(amount)} 点 · 余额 ${balance}`);
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const lines = ['玩家,邮箱,余额,状态,注册时间,今日次数,今日tokens'];
    for (const row of visible) {
      lines.push([row.nickname, row.email, row.balance, row.status === 'banned' ? '已封禁' : row.status === 'deleted' ? '已注销' : '正常', row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '', row.runsToday, row.tokensToday].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'players.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const q = query.trim().toLowerCase();
  const visible = rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (!q) return true;
    return `${row.nickname} ${row.email}`.toLowerCase().includes(q);
  });

  return (
    <>
      <ErrorLine message={error} />
      <div className="admin-toolbar">
        <label className="p-search">
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input className="p-input" type="search" value={query} placeholder="搜索昵称、邮箱" aria-label="搜索玩家" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Select className="p-select" value={status} aria-label="按状态筛选" onChange={(event) => setStatus(event.target.value)}>
          <option value="all">全部状态</option>
          <option value="active">正常</option>
          <option value="banned">已封禁</option>
        </Select>
        <span className="p-small" style={{ marginLeft: 'auto' }}>{visible.length} / {rows.length} 个账号</span>
        <button className="p-btn p-btn--sm" type="button" onClick={exportCsv}>导出玩家</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>玩家</th>
              <th>邮箱</th>
              <th>余额</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>今日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td data-label="玩家">
                  <Link href={`/admin/users/${row.id}`}><strong>{row.nickname}</strong></Link>
                  {row.role === 'admin' && <span className="p-pill p-pill--sm p-pill--outline" style={{ marginLeft: 6, height: 18, padding: '0 7px', fontSize: 10 }}>管理员</span>}
                </td>
                <td data-label="邮箱" className="small">{row.email}</td>
                <td data-label="余额">{row.balance.toLocaleString('zh-CN')} 点</td>
                <td data-label="状态">
                  <span className={`p-pill p-pill--sm ${row.status === 'banned' ? 'p-pill--danger' : row.status === 'deleted' ? 'p-pill--outline' : 'p-pill--ok'}`}>
                    {row.status === 'banned' ? '已封禁' : row.status === 'deleted' ? '已注销' : '正常'}
                  </span>
                </td>
                <td data-label="注册时间" className="small">{row.createdAt ? <LocalTime value={row.createdAt} style="date" /> : '—'}</td>
                <td data-label="今日" className="small">
                  <span className="p-cell-group">
                    <span className="p-nowrap">{row.runsToday} 次</span>
                    <span className="p-cell-sep"> · </span>
                    <span className="p-nowrap">{row.tokensToday.toLocaleString('zh-CN')} tokens</span>
                  </span>
                </td>
                <td data-label="操作">
                  <div className="admin-actions">
                    <input
                      className="p-input"
                      style={{ width: 64 }}
                      type="number"
                      placeholder="点数"
                      value={amounts[row.id] ?? ''}
                      onChange={(event) => setAmounts((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      aria-label={`给 ${row.nickname} 的点数`}
                    />
                    <input
                      className="p-input"
                      style={{ width: 96 }}
                      placeholder="备注"
                      value={notes[row.id] ?? ''}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      aria-label="备注"
                    />
                    <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busyId === row.id} onClick={() => void grant(row.id)}>
                      {busyId === row.id ? '处理中…' : '赠送'}
                    </button>
                    <button className={`p-btn p-btn--sm ${row.status === 'banned' ? '' : 'p-btn--danger'}`} type="button" disabled={busyId === row.id || row.status === 'deleted'} onClick={() => void toggleBan(row)}>
                      {row.status === 'deleted' ? '已注销' : row.status === 'banned' ? '解封' : '封禁'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={7} className="admin-empty">没有匹配的玩家。</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
