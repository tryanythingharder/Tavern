'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { confirmAction, toast } from '@/components/admin-feedback';
import { AdminEmpty, SortTh } from '@/components/admin-list';

type AdminUser = {
  id: number; email: string; nickname: string; role: string; status: string;
  createdAt: number | null; balance: number; tokensToday: number; runsToday: number;
};

const STATUS_TEXT: Record<string, string> = { active: '正常', banned: '已封禁', deleted: '已注销' };
const STATUS_PILL: Record<string, string> = { active: 'p-pill--ok', banned: 'p-pill--danger', deleted: 'p-pill--outline' };

// 玩家列表：搜索/筛选/排序/分页由服务端按 URL 参数完成；这里只负责行内操作（赠点弹窗、封禁/解封，乐观更新）。
export function AdminPanel({ users, sort, filtered }: { users: AdminUser[]; sort: { sort: string; dir: 'asc' | 'desc' }; filtered: boolean }) {
  const [rows, setRows] = useState(users);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [granting, setGranting] = useState<AdminUser | null>(null);
  const [amount, setAmount] = useState('100');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => setRows(users), [users]);

  const toggleBan = async (row: AdminUser) => {
    const next = row.status === 'banned' ? 'active' : 'banned';
    if (next === 'banned' && !(await confirmAction({ title: '封禁账号？', message: `「${row.nickname}」将无法登录，所有登录设备立即下线。`, confirmLabel: '封禁', danger: true }))) return;
    setBusyId(row.id);
    // 乐观更新：先改界面，失败回滚
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: next } : item)));
    try {
      await api(`/api/admin/users/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      toast.ok(next === 'banned' ? `已封禁「${row.nickname}」` : `已解封「${row.nickname}」`);
    } catch (caught) {
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status: row.status } : item)));
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openGrant = (row: AdminUser) => {
    setGranting(row);
    setAmount('100');
    setNote('');
    setError('');
  };

  const grant = async () => {
    if (!granting) return;
    const value = Number(amount);
    if (!Number.isInteger(value) || value === 0) { setError('点数要填一个非零整数'); return; }
    if (value < 0 && !(await confirmAction({ title: '扣减点数？', message: `将从「${granting.nickname}」的余额里扣掉 ${-value} 点。`, confirmLabel: `扣减 ${-value} 点`, danger: true }))) return;
    if (value >= 10000 && !(await confirmAction({ title: '大额赠点', message: `将给「${granting.nickname}」赠送 ${value.toLocaleString('zh-CN')} 点，确认金额无误？`, confirmLabel: '确认赠送' }))) return;
    const target = granting;
    setBusyId(target.id);
    setError('');
    try {
      const { balance } = await api<{ balance: number }>('/api/admin/grant', { method: 'POST', body: JSON.stringify({ userId: target.id, amount: value, note }) });
      setRows((prev) => prev.map((row) => (row.id === target.id ? { ...row, balance } : row)));
      setGranting(null);
      toast.ok(`${value > 0 ? '已赠送' : '已扣减'} ${Math.abs(value)} 点给「${target.nickname}」· 余额 ${balance.toLocaleString('zh-CN')}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const lines = ['ID,玩家,邮箱,余额,状态,注册时间,今日次数,今日tokens'];
    for (const row of rows) {
      lines.push([row.id, row.nickname, row.email, row.balance, STATUS_TEXT[row.status] ?? row.status, row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '', row.runsToday, row.tokensToday].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'players.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  return (
    <>
      <div className="a-tablehead">
        <span className="p-small">点昵称进入玩家详情（订单、流水、举报、设备都在那里）</span>
        <button className="p-btn p-btn--sm" type="button" onClick={exportCsv}>导出本页 CSV</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table a-cards">
          <thead>
            <tr>
              <SortTh k="nickname" label="玩家" first="asc" current={sort} />
              <th>邮箱</th>
              <SortTh k="balance" label="余额" current={sort} />
              <th>状态</th>
              <SortTh k="created" label="注册时间" current={sort} />
              <SortTh k="tokens" label="今日" current={sort} />
              <th><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="玩家" className="a-primary">
                  <Link href={`/admin/users/${row.id}`}><strong>{row.nickname}</strong></Link>
                  <span className="a-id">#{row.id}</span>
                  {row.role === 'admin' && <span className="p-pill p-pill--sm p-pill--outline a-tag">管理员</span>}
                </td>
                <td data-label="邮箱" className="small a-sub">{row.email}</td>
                <td data-label="余额">{row.balance.toLocaleString('zh-CN')} 点</td>
                <td data-label="状态">
                  <span className={`p-pill p-pill--sm ${STATUS_PILL[row.status] ?? 'p-pill--outline'}`}>{STATUS_TEXT[row.status] ?? row.status}</span>
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
                    <button className="p-btn p-btn--sm" type="button" disabled={busyId === row.id || row.status === 'deleted'} onClick={() => openGrant(row)} aria-label={`给 ${row.nickname} 调整点数`}>赠点</button>
                    <button className={`p-btn p-btn--sm ${row.status === 'banned' ? '' : 'p-btn--danger'}`} type="button" disabled={busyId === row.id || row.status === 'deleted'} onClick={() => void toggleBan(row)} aria-label={`${row.status === 'banned' ? '解封' : '封禁'} ${row.nickname}`}>
                      {row.status === 'deleted' ? '已注销' : row.status === 'banned' ? '解封' : '封禁'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <AdminEmpty colSpan={7} filtered={filtered}>还没有玩家。</AdminEmpty>}
          </tbody>
        </table>
      </div>

      {granting && (
        <Modal
          title={`调整点数 · ${granting.nickname}`}
          onClose={() => setGranting(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setGranting(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busyId === granting.id} onClick={() => void grant()}>
                {busyId === granting.id ? '处理中…' : Number(amount) < 0 ? '扣减' : '赠送'}
              </button>
            </>
          }
        >
          <p className="p-small" style={{ marginTop: 0 }}>当前余额 {granting.balance.toLocaleString('zh-CN')} 点。正数为赠送，负数为扣减；赠送会给玩家发站内通知。</p>
          <form onSubmit={(event) => { event.preventDefault(); void grant(); }}>
            <div className="p-field">
              <label htmlFor="grant-amount">点数</label>
              <input id="grant-amount" className="p-input" type="number" step={1} value={amount} autoFocus onChange={(event) => setAmount(event.target.value)} />
              <div className="a-quick">
                {[50, 100, 500, 1000].map((value) => <button key={value} type="button" className="p-chip" onClick={() => setAmount(String(value))}>+{value}</button>)}
              </div>
            </div>
            <div className="p-field">
              <label htmlFor="grant-note">备注（玩家可见）</label>
              <input id="grant-note" className="p-input" value={note} maxLength={60} placeholder="赠点 / 补偿 / 扣回" onChange={(event) => setNote(event.target.value)} />
            </div>
          </form>
          <ErrorLine message={error} />
        </Modal>
      )}
    </>
  );
}
