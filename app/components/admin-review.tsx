'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminEmpty, SortTh } from '@/components/admin-list';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { toast, undoable } from '@/components/admin-feedback';

type CharacterRow = {
  id: string; name: string; author: string; category: string; status: string;
  nsfw: boolean; createdAt: number | null; ownerName: string | null; ownerId?: number | null;
};

const STATUS_LABEL: Record<string, string> = { pending: '待审核', published: '已公开', archived: '已下架', draft: '草稿' };
const STATUS_PILL: Record<string, string> = { pending: 'p-pill--warn', published: 'p-pill--ok', archived: 'p-pill--outline', draft: 'p-pill--outline' };

const post = (id: string, status: 'published' | 'archived', reason = '') =>
  api(`/api/admin/characters/${id}/status`, { method: 'POST', keepalive: true, body: JSON.stringify({ status, reason }) });

// 依次提交，汇总失败（任何一条失败都抛出，toast 里列出失败数）
async function runAll(rows: CharacterRow[], status: 'published' | 'archived', reason = '') {
  const failed: string[] = [];
  for (const row of rows) {
    try { await post(row.id, status, reason); } catch (caught) { failed.push(`「${row.name}」${(caught as Error).message}`); }
  }
  if (failed.length) throw new Error(`${failed.length} 个失败：${failed.slice(0, 3).join('；')}`);
}

// 广场审核：通过（单个/批量）先乐观更新，6 秒内可撤销，到时才真正提交（通过会通知作者和关注者，发出去就收不回）；
// 驳回/下架（单个/批量）要填理由并在弹窗里确认后立即提交。
export function AdminReview({ characters, sort, filtered }: { characters: CharacterRow[]; sort: { sort: string; dir: 'asc' | 'desc' }; filtered: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(characters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejecting, setRejecting] = useState<CharacterRow[] | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => { setRows(characters); setSelected(new Set()); }, [characters]);

  const patchStatus = (ids: string[], status: string, before?: Map<string, string>) =>
    setRows((prev) => prev.map((row) => (ids.includes(row.id) ? { ...row, status: before?.get(row.id) ?? status } : row)));

  const approve = (targets: CharacterRow[]) => {
    if (!targets.length) return;
    const ids = targets.map((row) => row.id);
    const before = new Map(targets.map((row) => [row.id, row.status]));
    patchStatus(ids, 'published');
    setSelected(new Set());
    undoable({
      text: targets.length === 1 ? `「${targets[0].name}」已通过` : `已通过 ${targets.length} 个作品`,
      run: () => runAll(targets, 'published'),
      onUndo: () => patchStatus(ids, '', before),
      onDone: (ok) => { if (ok) toast.ok(targets.length === 1 ? `「${targets[0].name}」已公开，已通知作者` : `${targets.length} 个作品已公开，已通知作者`); router.refresh(); },
    });
  };

  const openReject = (targets: CharacterRow[]) => {
    if (!targets.length) return;
    setRejecting(targets);
    setReason('');
    setError('');
  };

  const reject = async () => {
    if (!rejecting) return;
    setBusy(true);
    setError('');
    try {
      await runAll(rejecting, 'archived', reason);
      patchStatus(rejecting.map((row) => row.id), 'archived');
      toast.ok(rejecting.length === 1 ? `「${rejecting[0].name}」已${rejecting[0].status === 'pending' ? '驳回' : '下架'}，已通知作者` : `已驳回/下架 ${rejecting.length} 个作品，已通知作者`);
      setRejecting(null);
      setSelected(new Set());
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allChecked = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const picked = rows.filter((row) => selected.has(row.id));
  const pickedPending = picked.filter((row) => row.status !== 'published');
  const pickedLive = picked.filter((row) => row.status !== 'archived');
  const rejectingPending = rejecting?.every((row) => row.status === 'pending');

  return (
    <>
      <ErrorLine message={rejecting ? '' : error} />
      <div className={`a-bulkbar${picked.length ? ' is-on' : ''}`} role="region" aria-label="批量操作" aria-live="polite">
        <label className="p-check a-checkall">
          <input type="checkbox" checked={allChecked} disabled={!rows.length} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((row) => row.id)))} aria-label="全选本页" />
          <span>{picked.length ? `已选 ${picked.length} 个` : '全选本页'}</span>
        </label>
        {picked.length > 0 && (
          <>
            <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!pickedPending.length} onClick={() => approve(pickedPending)}>通过 {pickedPending.length || ''}</button>
            <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={!pickedLive.length} onClick={() => openReject(pickedLive)}>驳回 / 下架 {pickedLive.length || ''}</button>
            <button className="p-btn p-btn--sm" type="button" onClick={() => setSelected(new Set())}>取消选择</button>
          </>
        )}
        <span className="p-small a-bulkhint">通过后 6 秒内可撤销</span>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table a-cards">
          <thead>
            <tr><th className="a-colcheck"><span className="sr-only">选择</span></th><SortTh k="name" label="角色" first="asc" current={sort} /><th>作者</th><th>题材</th><th>状态</th><SortTh k="created" label="创建时间" current={sort} /><th><span className="sr-only">操作</span></th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={selected.has(row.id) ? 'is-selected' : undefined}>
                <td className="a-colcheck" data-label="选择"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`选择「${row.name}」`} /></td>
                <td data-label="角色" className="a-primary">
                  <strong>{row.name}</strong>
                  {row.nsfw && <span className="p-pill p-pill--sm p-pill--outline a-tag">18+</span>}
                </td>
                <td data-label="作者">{row.ownerId ? <Link href={`/admin/users/${row.ownerId}`}>{row.ownerName ?? row.author}</Link> : row.ownerName ?? row.author}</td>
                <td data-label="题材">{row.category}</td>
                <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_PILL[row.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[row.status] ?? row.status}</span></td>
                <td data-label="创建时间" className="small">{row.createdAt ? <LocalTime value={row.createdAt} style="date" /> : '—'}</td>
                <td data-label="操作">
                  <div className="admin-actions">
                    <Link className="p-btn p-btn--sm" href={`/c/${row.id}`} aria-label={`查看「${row.name}」`}>查看</Link>
                    {row.status === 'pending' ? (
                      <>
                        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => approve([row])} aria-label={`通过「${row.name}」`}>通过</button>
                        <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busy} onClick={() => openReject([row])} aria-label={`驳回「${row.name}」`}>驳回</button>
                      </>
                    ) : row.status === 'archived' ? (
                      <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => approve([row])} aria-label={`恢复公开「${row.name}」`}>恢复公开</button>
                    ) : (
                      <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busy} onClick={() => openReject([row])} aria-label={`下架「${row.name}」`}>下架</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <AdminEmpty colSpan={7} filtered={filtered}>这个状态下没有作品。</AdminEmpty>}
          </tbody>
        </table>
      </div>
      {rejecting && (
        <Modal
          title={rejecting.length > 1 ? `驳回 / 下架 ${rejecting.length} 个作品` : rejectingPending ? '驳回作品' : '下架作品'}
          onClose={() => setRejecting(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setRejecting(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busy} onClick={() => void reject()}>
                {busy ? '处理中…' : rejecting.length > 1 ? `确认处理 ${rejecting.length} 个` : rejectingPending ? '确认驳回' : '确认下架'}
              </button>
            </>
          }
        >
          <p className="small" style={{ marginTop: 0 }}>
            {rejectingPending ? '驳回后作者会收到站内通知，可修改后重新提交。' : '下架后作品会从广场与搜索移除，作者会收到站内通知。'}
            {rejecting.length > 1 && <><br />涉及：{rejecting.slice(0, 6).map((row) => `「${row.name}」`).join('、')}{rejecting.length > 6 ? ` 等 ${rejecting.length} 个` : ''}</>}
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
