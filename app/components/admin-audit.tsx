'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LocalTime } from '@/components/local-time';
import { Select } from '@/components/ui-select';

export type AuditRow = {
  id: number;
  actorId: number | null;
  actorRole: 'user' | 'admin' | 'system';
  actorName: string;
  actorEmail: string;
  action: string;
  actionLabel: string;
  targetType: string;
  targetId: string;
  ip: string;
  userAgent: string;
  detail: string;
  createdAt: number;
};

export type AuditQuery = { scope: string; user: string; action: string; from: string; to: string; ip: string };
export type ActionGroup = { id: string; label: string; actions: { code: string; label: string }[] };

const ROLE_LABEL: Record<string, string> = { admin: '管理员', user: '用户', system: '系统' };
const TARGET_LABEL: Record<string, string> = {
  user: '用户', account: '账号', character: '角色', order: '订单', report: '举报', comment: '评论',
  code: '兑换码', invite: '邀请码', referral: '好友邀请码', audit: '操作日志', message: '消息', other: '其他',
};
const DETAIL_LABEL: Record<string, string> = {
  reason: '原因', method: '方式', status: '状态', archived: '归档', format: '格式', update: '覆盖更新', ok: '成功',
  amount: '点数', points: '点数', provider: '渠道', chats: '会话数', reportId: '举报号', referral: '好友邀请', invite: '邀请码',
};

function query(q: AuditQuery, page = 1): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) if (value && !(key === 'scope' && value === 'all')) params.set(key, value);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

const VALUE_LABEL: Record<string, string> = {
  bad_password: '密码错误', no_account: '账号不存在', banned: '账号已封禁', rate_limited: '尝试过于频繁', '2fa_code': '两步验证码错误',
  password: '密码', '2fa': '两步验证', png: 'PNG', json: 'JSON',
};

// 详情是 JSON 时逐项渲染（标签单独成节点，界面翻译才能命中词条）
function Detail({ text }: { text: string }) {
  if (!text) return <>—</>;
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      const items = Object.entries(obj);
      if (!items.length) return <>—</>;
      return (
        <>
          {items.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && ' · '}
              <span>{DETAIL_LABEL[k] ?? k}</span>{': '}
              <span>{typeof v === 'boolean' ? (v ? '是' : '否') : VALUE_LABEL[String(v)] ?? String(v)}</span>
            </span>
          ))}
        </>
      );
    } catch { /* 不是 JSON，原样显示 */ }
  }
  return <>{text}</>;
}

function Target({ row }: { row: AuditRow }) {
  if (!row.targetType) return <>—</>;
  const label = TARGET_LABEL[row.targetType] ?? row.targetType;
  if (row.targetType === 'user' && /^\d+$/.test(row.targetId)) return <Link href={`/admin/users/${row.targetId}`}>{label} #{row.targetId}</Link>;
  if (!row.targetId) return <>{label}</>;
  return <>{label} {row.targetType === 'account' || row.targetType === 'code' || row.targetType === 'invite' || row.targetType === 'referral' ? row.targetId : `#${row.targetId}`}</>;
}

export function AdminAudit({ entries, total, page, pages, current, groups }: {
  entries: AuditRow[];
  total: number;
  page: number;
  pages: number;
  current: AuditQuery;
  groups: ActionGroup[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<AuditQuery>(current);
  const set = (key: keyof AuditQuery, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    router.push(`/admin/audit${query({ ...form, scope: current.scope })}`);
  };
  const reset = () => {
    const empty = { scope: current.scope, user: '', action: '', from: '', to: '', ip: '' };
    setForm(empty);
    router.push(`/admin/audit${query(empty)}`);
  };

  return (
    <section className="p-card">
      <div className="admin-toolbar">
        <div className="p-tabs" role="tablist" aria-label="操作者类型">
          {([['all', '全部'], ['user', '用户操作'], ['admin', '管理员操作']] as const).map(([key, label]) => (
            <Link key={key} href={`/admin/audit${query({ ...current, scope: key })}`} role="tab" aria-selected={current.scope === key} className={current.scope === key ? 'is-active' : undefined}>{label}</Link>
          ))}
        </div>
      </div>
      <form className="admin-toolbar" onSubmit={submit} aria-label="筛选操作日志">
        <label className="p-search">
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input className="p-input" type="search" name="user" value={form.user} placeholder="用户昵称、邮箱或 id" aria-label="按用户筛选" onChange={(event) => set('user', event.target.value)} />
        </label>
        <Select className="p-select" value={form.action || 'all'} aria-label="按动作筛选" onChange={(event) => set('action', event.target.value === 'all' ? '' : event.target.value)}>
          <option value="all">全部动作</option>
          {groups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              <option value={`${group.id}.*`}>{`全部${group.label}`}</option>
              {group.actions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
            </optgroup>
          ))}
        </Select>
        <input className="p-input" style={{ width: 'auto' }} type="date" value={form.from} aria-label="开始日期" onChange={(event) => set('from', event.target.value)} />
        <span aria-hidden="true">–</span>
        <input className="p-input" style={{ width: 'auto' }} type="date" value={form.to} aria-label="结束日期" onChange={(event) => set('to', event.target.value)} />
        <input className="p-input" style={{ width: 180 }} type="search" value={form.ip} placeholder="IP（前缀匹配）" aria-label="按 IP 筛选" onChange={(event) => set('ip', event.target.value)} />
        <button className="p-btn p-btn--sm p-btn--primary" type="submit">筛选</button>
        <button className="p-btn p-btn--sm" type="button" onClick={reset}>清空</button>
        <a className="p-btn p-btn--sm" href={`/api/admin/audit${query({ ...current }) ? `${query({ ...current })}&format=csv` : '?format=csv'}`} download>导出 CSV</a>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>IP</th><th>详情</th></tr></thead>
          <tbody>
            {entries.map((row) => (
              <tr key={row.id}>
                <td data-label="时间" className="small"><LocalTime value={row.createdAt} /></td>
                <td data-label="操作者">
                  {row.actorId ? <Link href={`/admin/users/${row.actorId}`}>{row.actorName}</Link> : <span>{row.actorName}</span>}
                  <span className="small" style={{ marginLeft: 6, opacity: 0.7 }}>{ROLE_LABEL[row.actorRole] ?? row.actorRole}{row.actorId ? ` #${row.actorId}` : ''}</span>
                </td>
                <td data-label="动作" title={row.action}>{row.actionLabel}</td>
                <td data-label="对象" className="small"><Target row={row} /></td>
                <td data-label="IP" className="small" title={row.userAgent || undefined}>{row.ip || '—'}</td>
                <td data-label="详情" className="small"><Detail text={row.detail} /></td>
              </tr>
            ))}
            {!entries.length && <tr><td colSpan={6} className="admin-empty">没有匹配的操作记录。</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="p-table-foot" style={{ marginTop: 16 }}>
        <span className="p-foot-count">第 {page} / {pages} 页 · 共 {total} 条</span>
        <div className="p-foot-right">
          {page > 1 && <Link className="p-btn p-btn--sm" href={`/admin/audit${query(current, page - 1)}`}>上一页</Link>}
          {page < pages && <Link className="p-btn p-btn--sm" href={`/admin/audit${query(current, page + 1)}`}>下一页</Link>}
        </div>
      </div>
    </section>
  );
}
