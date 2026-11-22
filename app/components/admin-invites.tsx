'use client';

import { LocalTime } from '@/components/local-time';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Invite = { code: string; note: string; usedBy: number | null; usedByName: string | null; createdByName: string | null; createdAt: number; usedAt: number | null };

export function AdminInvites({ initial, initialRequired }: { initial: Invite[]; initialRequired: boolean }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initial);
  const [count, setCount] = useState('5');
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<Invite[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [required, setRequired] = useState(initialRequired);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ invites: Invite[] }>('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ count: Number(count), note }),
      });
      setCreated(result.invites);
      setInvites((prev) => [...result.invites, ...prev]);
      setNotice(`已生成 ${result.invites.length} 个邀请码`);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleRequired = async (value: boolean) => {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/invites', { method: 'PATCH', body: JSON.stringify({ required: value }) });
      setRequired(value);
      setNotice(value ? '已开启：注册必须填写邀请码。' : '已关闭：邀请码改为选填。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((current) => (current === code ? null : current)), 1200);
    } catch {
      setError('复制失败，请手动选中');
    }
  };

  const unused = invites.filter((invite) => !invite.usedBy).length;
  const used = invites.length - unused;

  return (
    <>
      <ErrorLine message={error} />
      <div className="p-kpis" style={{ marginBottom: 20 }}>
        <div className="p-card p-card--pad"><div className="p-kpi-label">未使用</div><div className="p-kpi-value">{unused}</div><div className="p-kpi-delta">可发放</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">已使用</div><div className="p-kpi-value">{used}</div><div className="p-kpi-delta">已注册</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">注册策略</div><div className="p-kpi-value" style={{ fontSize: 20 }}>{required ? '必须邀请' : '选填'}</div><div className="p-kpi-delta">{required ? '新用户需邀请码' : '开放注册'}</div></div>
        <div className="p-card p-card--pad"><div className="p-kpi-label">总数</div><div className="p-kpi-value">{invites.length}</div><div className="p-kpi-delta">最近 100 个</div></div>
      </div>
      {notice && <p className="small" role="status" style={{ margin: '0 0 10px', color: 'var(--ok, #2e7d43)' }}>{notice}</p>}
      <section className="p-card p-card--pad">
        <div className="p-block-head" style={{ padding: 0, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>注册策略</h2>
          <label className="p-check" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={required} disabled={busy} onChange={(event) => void toggleRequired(event.target.checked)} />
            <span>注册必须填写邀请码</span>
          </label>
        </div>
        <p className="p-small">关闭时邀请码为选填；开启后新注册必须使用一个未使用的邀请码。</p>
      </section>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">生成邀请码</h2>
        <p className="p-small">注册时填写会校验并标记使用。</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="p-small">数量</span>
          <input className="p-input" style={{ width: 90 }} type="number" min={1} max={100} value={count} onChange={(event) => setCount(event.target.value)} aria-label="数量" />
          <input className="p-input" style={{ flex: '1 1 160px' }} value={note} placeholder="备注（可选）" onChange={(event) => setNote(event.target.value)} aria-label="备注" />
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void generate()}>{busy ? '生成中…' : '生成'}</button>
        </div>
        {created.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="small" style={{ margin: '0 0 6px' }}>刚生成的码（点一下复制）：</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {created.map((invite) => (
                <button key={invite.code} className="p-chip" type="button" onClick={() => void copy(invite.code)}>
                  {copied === invite.code ? '已复制' : invite.code}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="p-card" style={{ marginTop: 20 }}>
        <div className="p-block-head"><h2>最近的邀请码</h2><span className="p-small">{invites.length} 个</span></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>邀请码</th><th>备注</th><th>创建人</th><th>使用人</th><th>状态</th><th>生成时间</th></tr></thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.code}>
                  <td data-label="邀请码" style={{ fontFamily: 'ui-monospace, monospace' }}>{invite.code}</td>
                  <td data-label="备注">{invite.note || '—'}</td>
                  <td data-label="创建人">{invite.createdByName ?? '—'}</td>
                  <td data-label="使用人">{invite.usedByName ?? '—'}</td>
                  <td data-label="状态"><span className={`p-pill p-pill--sm ${invite.usedBy ? 'p-pill--outline' : 'p-pill--ok'}`}>{invite.usedBy ? '已使用' : '未使用'}</span></td>
                  <td data-label="生成时间" className="small"><LocalTime value={invite.createdAt} /></td>
                </tr>
              ))}
              {!invites.length && <tr><td colSpan={6} className="admin-empty">还没有邀请码。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
