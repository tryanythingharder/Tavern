'use client';

import { LocalTime } from '@/components/local-time';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { toast } from '@/components/admin-feedback';

type Report = {
  id: number;
  reporterName: string;
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

const TARGET_LABEL: Record<string, string> = { character: '角色', message: '消息', user: '用户', comment: '评论', other: '其他' };

export function AdminReports({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<{ report: Report; action: 'archive' | 'ban' } | null>(null);

  const resolve = async (id: number, action: 'resolved' | 'dismissed') => {
    setBusyId(id);
    setError('');
    try {
      await api(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: JSON.stringify({ action }) });
      toast.ok(action === 'resolved' ? `举报 #${id} 已标记处理` : `举报 #${id} 已驳回`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      toast.err((caught as Error).message);
    } finally {
      setBusyId(null);
    }
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
      <div className="p-rows">
        {reports.map((report) => (
          <div className="p-room-card" key={report.id} style={{ alignItems: 'flex-start' }}>
            <div className="p-room-main">
              <div className="p-room-title" style={{ fontSize: 13.5 }}>
                {report.reason}
                <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 18, padding: '0 7px', fontSize: 10, marginLeft: 6 }}>
                  {TARGET_LABEL[report.targetType] ?? report.targetType} #{report.targetId}
                </span>
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
              <div className="p-room-last">举报人：{report.reporterName} · <LocalTime value={report.createdAt} /></div>
            </div>
            <div className="p-library-actions">
              {report.target.link && <Link className="p-btn p-btn--sm" href={report.target.link}>查看内容</Link>}
              {report.target.characterId && (
                <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === report.id} onClick={() => setConfirming({ report, action: 'archive' })}>下架角色</button>
              )}
              {report.target.userId && (
                <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === report.id} onClick={() => setConfirming({ report, action: 'ban' })}>封禁用户</button>
              )}
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === report.id} onClick={() => void resolve(report.id, 'resolved')}>已处理</button>
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === report.id} onClick={() => void resolve(report.id, 'dismissed')}>驳回</button>
            </div>
          </div>
        ))}
        {!reports.length && <p className="small">没有待处理的举报。</p>}
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
