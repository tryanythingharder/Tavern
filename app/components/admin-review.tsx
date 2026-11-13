'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type CharacterRow = {
  id: string; name: string; author: string; category: string; status: string;
  nsfw: boolean; createdAt: number | null; ownerName: string | null;
};

const STATUS_LABEL: Record<string, string> = { pending: '待审核', published: '已公开', archived: '已下架', draft: '草稿' };
const STATUS_PILL: Record<string, string> = { pending: 'p-pill--warn', published: 'p-pill--ok', archived: 'p-pill--outline', draft: 'p-pill--outline' };

export function AdminReview({ characters }: { characters: CharacterRow[] }) {
  const [rows, setRows] = useState(characters);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [rejecting, setRejecting] = useState<CharacterRow | null>(null);
  const [reason, setReason] = useState('');

  const setStatus = async (row: CharacterRow, status: 'published' | 'archived', note = '') => {
    setBusyId(row.id);
    setError('');
    try {
      await api(`/api/admin/characters/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status, reason: note }) });
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, status } : item)));
      setRejecting(null);
      setReason('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (row: CharacterRow) => {
    setRejecting(row);
    setReason('');
    setError('');
  };

  const q = query.trim().toLowerCase();
  const visible = rows.filter((row) => (!q ? true : `${row.name} ${row.author} ${row.ownerName ?? ''}`.toLowerCase().includes(q)));

  return (
    <>
      <ErrorLine message={error} />
      <div className="admin-toolbar">
        <label className="p-search">
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input className="p-input" type="search" value={query} placeholder="搜索角色或作者" aria-label="搜索作品" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="p-small" style={{ marginLeft: 'auto' }}>{visible.length} / {rows.length} 个作品</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>角色</th><th>作者</th><th>题材</th><th>状态</th><th>创建时间</th><th>操作</th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td data-label="角色">
                  <strong>{row.name}</strong>
                  {row.nsfw && <span className="p-pill p-pill--sm p-pill--outline" style={{ marginLeft: 6, height: 18, padding: '0 7px', fontSize: 10 }}>18+</span>}
                </td>
                <td data-label="作者">{row.ownerName ?? row.author}</td>
                <td data-label="题材">{row.category}</td>
                <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_PILL[row.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[row.status] ?? row.status}</span></td>
                <td data-label="创建时间" className="small">{row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '—'}</td>
                <td data-label="操作">
                  <div className="admin-actions">
                    <Link className="p-btn p-btn--sm" href={`/c/${row.id}`}>查看</Link>
                    {row.status === 'pending' ? (
                      <>
                        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busyId === row.id} onClick={() => void setStatus(row, 'published')}>通过</button>
                        <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === row.id} onClick={() => openReject(row)}>拒绝</button>
                      </>
                    ) : row.status === 'archived' ? (
                      <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busyId === row.id} onClick={() => void setStatus(row, 'published')}>
                        {busyId === row.id ? '处理中…' : '恢复公开'}
                      </button>
                    ) : (
                      <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === row.id} onClick={() => openReject(row)}>下架</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={6} className="admin-empty">还没有用户创作的角色。</td></tr>}
          </tbody>
        </table>
      </div>
      {rejecting && (
        <Modal
          title={rejecting.status === 'pending' ? '拒绝作品' : '下架作品'}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setRejecting(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === rejecting.id} onClick={() => void setStatus(rejecting, 'archived', reason)}>
                {busyId === rejecting.id ? '处理中…' : rejecting.status === 'pending' ? '确认拒绝' : '确认下架'}
              </button>
            </>
          }
        >
          <p className="small" style={{ marginTop: 0 }}>
            {rejecting.status === 'pending'
              ? `拒绝后作者会收到站内通知，可修改后重新提交。`
              : `下架后作品会从广场与搜索移除，作者会收到站内通知。`}
          </p>
          <div className="field">
            <label htmlFor="review-reason">理由（会发给作者，可留空）</label>
            <textarea
              id="review-reason"
              className="textarea"
              rows={3}
              maxLength={200}
              value={reason}
              placeholder="例如：简介与开场白信息不足，建议补充人物关系和一个具体场景。"
              onChange={(event) => setReason(event.target.value)}
            />
            <span className="p-small" style={{ textAlign: 'right' }}>{reason.length} / 200</span>
          </div>
          <ErrorLine message={error} />
        </Modal>
      )}
    </>
  );
}
