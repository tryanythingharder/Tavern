'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';
import { askConfirm } from '@/components/ui-dialog';

type Field = {
  key: string; label: string; hint?: string; placeholder?: string; secret?: boolean;
  kind?: 'text' | 'textarea' | 'select' | 'switch' | 'number'; options?: { value: string; label: string }[];
  envName: string | null; source: 'admin' | 'env' | 'none'; value: string; effective: string;
};
type Group = { id: string; title: string; intro: string; fields: Field[] };
type Plugin = { id: string; label: string; hint: string; configured: boolean; active: boolean };
type State = {
  storage: { active: string; s3Ready: boolean };
  stripe: { ready: boolean; active: string | null };
  moderation: { enabled: boolean };
  alert: { ready: boolean };
  backup: { remote: boolean; last: { at: string; ok: boolean; uploaded?: boolean; message?: string } | null };
  push: { publicKey: string; subject: string; source: 'env' | 'auto'; subscriptions: number };
  ageVerify: { providers: Plugin[] };
};
type Status = { groups: Group[]; state: State };

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 22, padding: '0 10px', fontSize: 11, color: ok ? 'var(--ok, #2e7d43)' : 'var(--muted)' }}>{text}</span>
  );
}

function groupBadge(id: string, s: State, groups: Group[]): { ok: boolean; text: string } | null {
  const filled = (key: string) => groups.flatMap((g) => g.fields).find((f) => f.key === key)?.source !== 'none';
  switch (id) {
    case 'legal': {
      const ok = filled('site.operatorName') && filled('site.supportEmail');
      return { ok, text: ok ? '已填写' : '待填写' };
    }
    case 'stripe': return { ok: s.stripe.ready, text: s.stripe.ready ? (s.stripe.active === 'stripe' ? '已启用' : '已配置，未选为收款渠道') : '未配置' };
    case 'storage': return { ok: s.storage.active === 's3', text: s.storage.active === 's3' ? '当前：对象存储' : '当前：本地磁盘' };
    case 'backup': return { ok: s.backup.remote, text: s.backup.remote ? '会上传异地' : '只存本机' };
    case 'alert': return { ok: s.alert.ready, text: s.alert.ready ? '已配置' : '未配置' };
    case 'moderation': return { ok: s.moderation.enabled, text: s.moderation.enabled ? '已启用' : '未启用' };
    case 'push': return { ok: true, text: s.push.source === 'env' ? '密钥来自环境变量' : '密钥已自动生成' };
    default: return null;
  }
}

function sourceNote(field: Field): string {
  if (field.secret) return field.source === 'admin' ? '已保存，留空不变' : field.source === 'env' ? `使用环境变量 ${field.envName}，填写可覆盖` : '未设置';
  if (field.source === 'env') return `当前来自环境变量 ${field.envName}`;
  return '';
}

export function AdminServices({ only }: { only?: string } = {}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>('/api/admin/services'));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const valueOf = (field: Field) => draft[field.key] ?? (field.secret ? '' : field.source === 'admin' ? field.value : '');

  const save = async (group: Group, clear: string[] = []) => {
    setBusy(group.id);
    setError('');
    setNotice('');
    try {
      const values: Record<string, string> = {};
      for (const field of group.fields) if (draft[field.key] !== undefined) values[field.key] = draft[field.key];
      // 普通字段清空 = 删掉后台值（回到环境变量 / 默认）
      const cleared = group.fields.filter((field) => !field.secret && field.kind !== 'switch' && draft[field.key] !== undefined && !draft[field.key].trim() && field.source === 'admin').map((field) => field.key);
      const next = await api<Status>('/api/admin/services', { method: 'PATCH', body: JSON.stringify({ values, clear: [...clear, ...cleared] }) });
      setStatus(next);
      setDraft((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !group.fields.some((field) => field.key === key))));
      setNotice(`「${group.title}」已保存`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const action = async (name: 'testAlert' | 'testStorage' | 'regenVapid') => {
    if (name === 'regenVapid') {
      const ok = await askConfirm({ title: '重新生成推送密钥？', message: '所有已开启通知的设备都会失效，用户需要重新打开通知。一般只在密钥泄露时这么做。', confirmLabel: '重新生成', danger: true });
      if (!ok) return;
    }
    setBusy(name);
    setError('');
    setNotice('');
    try {
      const data = await api<{ message: string } & Partial<Status>>('/api/admin/services', { method: 'POST', body: JSON.stringify({ action: name }) });
      if (data.groups && data.state) setStatus({ groups: data.groups, state: data.state });
      setNotice(data.message);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status) return <><ErrorLine message={error} /><p className="small">加载中…</p></>;
  const s = status.state;

  return (
    <>
      <ErrorLine message={error} />
      {notice && <p className="admin-toast" role="status">{notice}</p>}

      {status.groups.filter((group) => !only || group.id === only).map((group) => {
        const badge = groupBadge(group.id, s, status.groups);
        const dirty = group.fields.some((field) => draft[field.key] !== undefined);
        const hasOwnSecret = group.fields.some((field) => field.secret && field.source === 'admin');
        return (
          <section key={group.id} id={group.id} className="p-card p-card--pad" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <h2 className="p-form-section-title" style={{ margin: 0 }}>{group.title}</h2>
              {badge && <Badge ok={badge.ok} text={badge.text} />}
            </div>
            {!only && <p className="small" style={{ margin: '0 0 14px' }}>{group.intro}</p>}

            <div className="p-field-row">
              {group.fields.filter((field) => field.kind !== 'switch').map((field) => {
                const note = sourceNote(field);
                const id = `svc-${field.key.replace(/\./g, '-')}`;
                return (
                  <div className="p-field" key={field.key}>
                    <label htmlFor={id}>{field.label}</label>
                    {field.kind === 'select' ? (
                      <Select id={id} aria-label={field.label} className="p-input" value={valueOf(field)} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}>
                        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Select>
                    ) : (
                      <input
                        id={id}
                        className="p-input"
                        type={field.secret ? 'password' : field.kind === 'number' ? 'number' : 'text'}
                        inputMode={field.kind === 'number' ? 'numeric' : undefined}
                        autoComplete={field.secret ? 'new-password' : 'off'}
                        value={valueOf(field)}
                        placeholder={field.secret ? note : (field.source === 'env' ? field.effective : field.placeholder ?? '')}
                        onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                      />
                    )}
                    {(field.hint || (!field.secret && note)) && <span className="p-small">{[field.hint, field.secret ? '' : note].filter(Boolean).join(' · ')}</span>}
                  </div>
                );
              })}
            </div>

            {group.fields.filter((field) => field.kind === 'switch').map((field) => {
              const checked = (draft[field.key] ?? field.effective) === '1' || (draft[field.key] === undefined && ['true', 'on', 'yes'].includes(field.effective));
              return (
                <label className="p-check" key={field.key} style={{ margin: '4px 0 12px' }}>
                  <input type="checkbox" checked={checked} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.checked ? '1' : '0' })} />
                  <span>{field.label}{field.hint && <span className="p-small">{field.hint}</span>}</span>
                </label>
              );
            })}

            {group.id === 'push' && (
              <p className="small" style={{ margin: '0 0 12px', wordBreak: 'break-all' }}>
                <span>公钥：<code>{s.push.publicKey}</code></span><br />
                <span>当前联系地址：{s.push.subject} · 已订阅设备 {s.push.subscriptions} 台</span>
              </p>
            )}
            {group.id === 'backup' && (
              <p className="small" style={{ margin: '0 0 12px' }}>
                {s.backup.last
                  ? <>上次备份：{new Date(s.backup.last.at).toLocaleString()} · {s.backup.last.ok ? (s.backup.last.uploaded ? '成功，已上传' : '成功，仅本机') : <span style={{ color: 'var(--danger)' }}>失败：{s.backup.last.message}</span>}</>
                  : '还没有备份记录。服务器上加好 cron 后，这里会显示每次的结果。'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === group.id || !dirty} onClick={() => void save(group)}>{busy === group.id ? '保存中…' : '保存'}</button>
              {group.id === 'storage' && <button className="p-btn p-btn--sm" type="button" disabled={busy === 'testStorage' || !s.storage.s3Ready} onClick={() => void action('testStorage')}>{busy === 'testStorage' ? '测试中…' : '测试读写'}</button>}
              {group.id === 'alert' && <button className="p-btn p-btn--sm" type="button" disabled={busy === 'testAlert' || !s.alert.ready} onClick={() => void action('testAlert')}>{busy === 'testAlert' ? '发送中…' : '发一条测试告警'}</button>}
              {group.id === 'push' && s.push.source === 'auto' && <button className="p-btn p-btn--sm" type="button" disabled={busy === 'regenVapid'} onClick={() => void action('regenVapid')}>重新生成密钥</button>}
              {hasOwnSecret && (
                <button
                  className="p-btn p-btn--sm"
                  type="button"
                  disabled={busy === group.id}
                  onClick={() => void askConfirm({ title: '清除这一组的密钥？', message: '清除后会回到环境变量里的值；没有环境变量就是未配置。', confirmLabel: '清除', danger: true }).then((ok) => { if (ok) void save(group, group.fields.filter((field) => field.secret && field.source === 'admin').map((field) => field.key)); })}
                >清除密钥</button>
              )}
            </div>
          </section>
        );
      })}

      {(!only || only === 'age') && (
      <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>年龄验证</h2>
          <Badge ok={s.ageVerify.providers.some((item) => item.configured)} text={s.ageVerify.providers.length ? '见下方' : '尚未接入服务商'} />
        </div>
        <p className="small" style={{ margin: 0 }}>
          {s.ageVerify.providers.length
            ? s.ageVerify.providers.map((item) => `${item.label}：${item.configured ? (item.active ? '使用中' : '已配置') : '未配置'}`).join(' · ')
            : '还没有接入年龄验证服务商。在「内容分级」里列为「需要验证」的地区，目前只能由管理员在玩家详情里手动标记已验证。接入新服务商需要在 lib/age-verify/ 加一个适配文件。'}
        </p>
      </section>
      )}
    </>
  );
}
