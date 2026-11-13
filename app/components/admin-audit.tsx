'use client';

import { useState } from 'react';

type Entry = { id: number; adminName: string; action: string; detail: string; createdAt: number };

export function AdminAudit({ initial }: { initial: Entry[] }) {
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('all');

  const actions = [...new Set(initial.map((entry) => entry.action))];
  const q = query.trim().toLowerCase();
  const visible = initial.filter((entry) => {
    if (action !== 'all' && entry.action !== action) return false;
    if (!q) return true;
    return `${entry.adminName} ${entry.action} ${entry.detail}`.toLowerCase().includes(q);
  });

  const exportCsv = () => {
    const lines = ['时间,管理员,操作,详情'];
    for (const entry of visible) {
      lines.push([new Date(entry.createdAt).toLocaleString('zh-CN'), entry.adminName, entry.action, entry.detail].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'audit-log.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  return (
    <section className="p-card">
      <div className="admin-toolbar">
        <label className="p-search">
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input className="p-input" type="search" value={query} placeholder="搜索管理员、动作或对象" aria-label="搜索审计日志" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select className="p-select" value={action} aria-label="按动作筛选" onChange={(event) => setAction(event.target.value)}>
          <option value="all">全部动作</option>
          {actions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="p-btn p-btn--sm" type="button" onClick={exportCsv}>导出日志</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>详情</th></tr></thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.id}>
                <td data-label="时间" className="small">{new Date(entry.createdAt).toLocaleString('zh-CN')}</td>
                <td data-label="管理员">{entry.adminName}</td>
                <td data-label="操作">{entry.action}</td>
                <td data-label="详情" className="small">{entry.detail || '—'}</td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={4} className="admin-empty">没有匹配的审计记录。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
