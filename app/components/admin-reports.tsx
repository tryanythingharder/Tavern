'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { toast, undoable } from '@/components/admin-feedback';

type Report = {
  id: number;
  reporterId?: number;
  reporterName: string;
  status?: string;
  targetType: string;
  targetId: string;
  reason: string;
  note: string;
  createdAt: number;
  target: {
    preview: string;
    detail: string;
    link: string | null;
    characterId: string | null;
    userId: number | null;
    userName: string | null;
  };
};

const STATUS_TEXT: Record<string, [string, string]> = { open: ['待处理', 'p-pill--warn'], resolved: ['已处理', 'p-pill--ok'], dismissed: ['已驳回', 'p-pill--outline'] };
const TARGET_LABEL: Record<string, string> = { character: '角色', message: '消息', user: '用户', comment: '评论', other: '其他' };

export function AdminReports({ reports, filtered = false }: { reports: Report[]; filtered?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ report: Report; action: 'archive' | 'ban' } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  useEffect(() => { setSelected(new Set()); setHidden(new Set()); }, [reports]);
  const visible = reports.filter((report) => !hidden.has(report.id));
  const openRows = visible.filter((report) => !report.status || report.status === 'open');
  const picked = openRows.filter((report) => selected.has(report.id));
  const allChecked = openRows.length > 0 && picked.length === openRows.length;
  const toggle = (id: number) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  // 已处理/驳回：先从列表里拿掉，6 秒内可撤销，到时才提交（提交后会通知举报人，收不回）
  const resolve = (targets: Report[], action: 'resolved' | 'dismissed') => {
    if (!targets.length) return;
    const ids = targets.map((report) => report.id);
    setHidden((prev) => new Set([...prev, ...ids]));
    setSelected(new Set());
    const verb = action === 'resolved' ? '标记已处理' : '驳回';
    undoable({
      text: targets.length === 1 ? `举报 #${ids[0]} 已${verb}` : `已${verb} ${targets.length} 件举报`,
      run: async () => {
        const failed: number[] = [];
        for (const id of ids) {
          try { await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', keepalive: true, body: JSON.stringify({ action }) }); } catch { failed.push(id); }
        }
        if (failed.length) throw new Error(`${failed.length} 件没处理成功（#${failed.join('、#')}），可能已被其他管理员处理`);
      },
      onUndo: () => setHidden((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; }),
      onDone: () => router.refresh(),
    });
  };

  const act = async () => {
    if (!confirming) return;
    const { report, action } = confirming;
    setBusyId(report.id);
    setError('');
    try {
      if (action === 'archive' && report.target.characterId) {
        await api(`/api/admin/characters/${report.target.characterId}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: 'archived', reason: `举报处理：${report.reason}` }),
        });
      } else if (action === 'ban' && report.target.userId) {
        await api(`/api/admin/users/${report.target.userId}/status`, { method: 'POST', body: JSON.stringify({ status: 'banned' }) });
      }
      await api(`/api/admin/reports/${report.id}/resolve`, { method: 'POST', body: JSON.stringify({ action: 'resolved' }) });
      setConfirming(null);
      toast.ok(action === 'archive' ? '已下架角色并结案' : '已封禁用户并结案');
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ErrorLine message={error} />
      {openRows.length > 0 && (
        <div className={`a-bulkbar${picked.length ? ' is-on' : ''}`} role="region" aria-label="批量操作" aria-live="polite">
          <label className="p-check a-checkall">
            <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(openRows.map((report) => report.id)))} aria-label="全选本页待处理举报" />
            <span>{picked.length ? `已选 ${picked.length} 件` : '全选本页'}</span>
          </label>
          {picked.length > 0 && (
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => resolve(picked, 'resolved')}>标记已处理 {picked.length}</button>
              <button className="p-btn p-btn--sm" type="button" onClick={() => resolve(picked, 'dismissed')}>驳回 {picked.length}</button>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setSelected(new Set())}>取消选择</button>
            </>
          )}
          <span className="p-small a-bulkhint">处理/驳回后 6 秒内可撤销；下架、封禁需单独确认</span>
        </div>
      )}
      <div className="p-rows">
        {visible.map((report) => (
          <div className={`p-room-card a-report${selected.has(report.id) ? ' is-selected' : ''}`} key={report.id} style={{ alignItems: 'flex-start' }}>
            {(!report.status || report.status === 'open') && (
              <input className="a-report-check" type="checkbox" checked={selected.has(report.id)} onChange={() => toggle(report.id)} aria-label={`选择举报 #${report.id}（${report.reason}）`} />
            )}
            <div className="p-room-main">
              <div className="p-room-title" style={{ fontSize: 13.5 }}>
                {report.reason}
                <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 18, padding: '0 7px', fontSize: 10, marginLeft: 6 }}>
                  {TARGET_LABEL[report.targetType] ?? report.targetType} #{report.targetId}
                </span>
                {report.status && report.status !== 'open' && <span className={`p-pill p-pill--sm ${STATUS_TEXT[report.status]?.[1] ?? 'p-pill--outline'}`} style={{ marginLeft: 6 }}>{STATUS_TEXT[report.status]?.[0] ?? report.status}</span>}
              </div>
              <div className="p-room-last" style={{ whiteSpace: 'normal' }}>
                {report.note || '（没有补充说明）'}
              </div>
              <div className="p-room-last" style={{ whiteSpace: 'normal', color: 'var(--text)' }}>
                {report.target.preview || '（无法解析被举报内容）'}
              </div>
              {report.target.detail.length > 160 && (
                <details style={{ marginTop: 4 }}>
                  <summary className="p-small" style={{ cursor: 'pointer' }}>展开全文</summary>
                  <div className="p-small" style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{report.target.detail}</div>
                </details>
              )}
              <div className="p-room-last">举报人：{report.reporterId ? <Link href={`/admin/users/${report.reporterId}`}>{report.reporterName}</Link> : report.reporterName}{report.target.userId && <> · 被举报人：<Link href={`/admin/users/${report.target.userId}`}>{report.target.userName ?? `#${report.target.userId}`}</Link></>} · <LocalTime value={report.createdAt} /></div>
            </div>
            {(!report.status || report.status === 'open') && <div className="p-library-actions">
              {report.target.link && <Link className="p-btn p-btn--sm" href={report.target.link}>查看内容</Link>}
              {report.target.characterId && (
                <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === report.id} onClick={() => setConfirming({ report, action: 'archive' })} aria-label={`下架举报 #${report.id} 涉及的角色`}>下架角色</button>
              )}
              {report.target.userId && (
                <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === report.id} onClick={() => setConfirming({ report, action: 'ban' })} aria-label={`封禁举报 #${report.id} 涉及的用户 ${report.target.userName ?? ''}`}>{report.targetType === 'user' ? '封禁用户' : '封禁作者'}</button>
              )}
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === report.id} onClick={() => resolve([report], 'resolved')} aria-label={`举报 #${report.id} 标记已处理`}>已处理</button>
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === report.id} onClick={() => resolve([report], 'dismissed')} aria-label={`驳回举报 #${report.id}`}>驳回</button>
            </div>}
          </div>
        ))}
        {!visible.length && <p className="admin-empty">{filtered ? '没有符合条件的举报。' : '没有待处理的举报，队列已清空。'}</p>}
      </div>
      {confirming && (
        <Modal
          title={confirming.action === 'archive' ? '下架角色' : '封禁用户'}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === confirming.report.id} onClick={() => setConfirming(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === confirming.report.id} onClick={() => void act()}>
                {busyId === confirming.report.id ? '处理中…' : '确认处理'}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            {confirming.action === 'archive'
              ? `将下架「${confirming.report.target.userName ? `${confirming.report.target.userName} 的` : ''}角色」，并把举报标记为已处理。`
              : `将封禁用户「${confirming.report.target.userName ?? confirming.report.targetId}」并让所有会话失效，同时把举报标记为已处理。`}
          </p>
          <p className="small" style={{ margin: 0 }}>举报原因：{confirming.report.reason}</p>
        </Modal>
      )}
    </>
  );
}
