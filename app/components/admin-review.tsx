'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminEmpty, SortTh } from '@/components/admin-list';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { toast } from '@/components/admin-feedback';

type CharacterRow = {
  id: string; name: string; author: string; category: string; status: string;
  nsfw: boolean; createdAt: number | null; ownerName: string | null; ownerId?: number | null;
};

const STATUS_LABEL: Record<string, string> = { pending: '待审核', published: '已公开', archived: '已下架', draft: '草稿' };
const STATUS_PILL: Record<string, string> = { pending: 'p-pill--warn', published: 'p-pill--ok', archived: 'p-pill--outline', draft: 'p-pill--outline' };

export function AdminReview({ characters, sort, filtered }: { characters: CharacterRow[]; sort: { sort: string; dir: 'asc' | 'desc' }; filtered: boolean }) {
  const [rows, setRows] = useState(characters);
  useEffect(() => setRows(characters), [characters]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
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
      toast.ok(status === 'published' ? `「${row.name}」已公开` : `「${row.name}」已${row.status === 'pending' ? '驳回' : '下架'}，已通知作者`);
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (row: CharacterRow) => {
    setRejecting(row);
    setReason('');
    setError('');
  };

  const visible = rows;

  return (
    <>
      <ErrorLine message={error} />
      <div className="admin-table-wrap">
        <table className="admin-table a-cards">
          <thead>
            <tr><SortTh k="name" label="角色" first="asc" current={sort} /><th>作者</th><th>题材</th><th>状态</th><SortTh k="created" label="创建时间" current={sort} /><th><span className="sr-only">操作</span></th></tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td data-label="角色">
                  <strong>{row.name}</strong>
                  {row.nsfw && <span className="p-pill p-pill--sm p-pill--outline" style={{ marginLeft: 6, height: 18, padding: '0 7px', fontSize: 10 }}>18+</span>}
                </td>
                <td data-label="作者">{row.ownerId ? <Link href={`/admin/users/${row.ownerId}`}>{row.ownerName ?? row.author}</Link> : row.ownerName ?? row.author}</td>
                <td data-label="题材">{row.category}</td>
                <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_PILL[row.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[row.status] ?? row.status}</span></td>
                <td data-label="创建时间" className="small">{row.createdAt ? <LocalTime value={row.createdAt} style="date" /> : '—'}</td>
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
            {!visible.length && <AdminEmpty colSpan={6} filtered={filtered}>这个状态下没有作品。</AdminEmpty>}
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
