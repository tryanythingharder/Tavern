'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { useNotice } from '@/components/admin-feedback';
import { Select } from '@/components/ui-select';

type Policy = { enabled: boolean; defaultHidden: boolean; blockedRegions: string[]; verifyRegions: string[]; minAge: number };
type Plugin = { id: string; label: string; hint: string; configured: boolean; active: boolean };
type Status = { policy: Policy; verifyProviders: Plugin[]; payment: { id: string; label: string; adultRestricted: boolean }; yourRegion: { country: string; region: string } | null };

export function AdminContent() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState<{ enabled: boolean; defaultHidden: boolean; blocked: string; verify: string; minAge: string } | null>(null);
  const [error, setError] = useState('');
  const setNotice = useNotice();
  const [busy, setBusy] = useState(false);

  const apply = (data: Status) => {
    setStatus(data);
    setForm({ enabled: data.policy.enabled, defaultHidden: data.policy.defaultHidden, blocked: data.policy.blockedRegions.join(' '), verify: data.policy.verifyRegions.join(' '), minAge: String(data.policy.minAge) });
  };

  const load = useCallback(async () => {
    try {
      apply(await api<Status>('/api/admin/nsfw'));
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      apply(await api<Status>('/api/admin/nsfw', {
        method: 'PATCH',
        body: JSON.stringify({ policy: { enabled: form.enabled, defaultHidden: form.defaultHidden, blockedRegions: form.blocked, verifyRegions: form.verify, minAge: Number(form.minAge) } }),
      }));
      setNotice('已保存。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!status || !form) return <><ErrorLine message={error} />{!error && <p className="p-small">加载中…</p>}</>;
  const where = status.yourRegion ? status.yourRegion.region || status.yourRegion.country : '未识别';
  const verifyReady = status.verifyProviders.some((item) => item.configured);

  return (
    <div className="p-admin-content">
      <ErrorLine message={error} />
      {form.enabled && status.payment.adultRestricted && (
        <div className="p-notice p-notice--warn">
          <div className="p-notice-main">
            <div className="p-notice-title">当前收款渠道是 {status.payment.label}，它不接受成人内容业务</div>
            <div>开着 18+ 用 {status.payment.label} 收款有被封户的风险。可以换支持成人内容的收款渠道（在 lib/payments/ 加一个实现），或者在这里关掉 18+ 只做全年龄。</div>
          </div>
        </div>
      )}

      <section className="p-card p-card--pad">
        <h2 className="p-form-section-title">18+ 内容</h2>
        <label className="p-check">
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
          <span>开放成人向角色<span className="p-small">关掉后全站只显示全年龄角色，成人向角色不能打开和聊天（作者本人仍可编辑自己的卡）</span></span>
        </label>
        <label className="p-check" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={form.defaultHidden} onChange={(event) => setForm({ ...form, defaultHidden: event.target.checked })} />
          <span>新账号默认隐藏 18+<span className="p-small">广场、发现页和搜索默认过滤，玩家确认年龄后可以自己打开；未登录访客一律不显示</span></span>
        </label>
        <div className="p-field" style={{ marginTop: 12, maxWidth: 220 }}>
          <label htmlFor="nsfw-min-age">成人内容年龄线</label>
          <Select id="nsfw-min-age" className="p-select" value={form.minAge} onChange={(event) => setForm({ ...form, minAge: event.target.value })}>
            {[18, 19, 20, 21].map((age) => <option key={age} value={age}>{age} 周岁</option>)}
          </Select>
        </div>
      </section>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">按地区</h2>
        <p className="p-small">填国家/地区代码（ISO 3166，如 GB、KR），也可以细到州/省（如 US-UT、US-TX）。用空格或逗号分隔。地区来自 CDN 注入的请求头（Cloudflare、Vercel、CloudFront），识别不出来的访问不受地区规则影响。你现在的地区：{where}</p>
        <div className="p-field" style={{ marginTop: 10 }}>
          <label htmlFor="nsfw-blocked">不提供 18+ 的地区</label>
          <textarea id="nsfw-blocked" className="p-input" rows={2} value={form.blocked} placeholder="例如 KR CN" onChange={(event) => setForm({ ...form, blocked: event.target.value })} />
        </div>
        <div className="p-field" style={{ marginTop: 10 }}>
          <label htmlFor="nsfw-verify">需要年龄验证的地区</label>
          <textarea id="nsfw-verify" className="p-input" rows={2} value={form.verify} placeholder="例如 GB US-UT US-TX US-LA" onChange={(event) => setForm({ ...form, verify: event.target.value })} />
          <span className="p-hint">这些地区的玩家要通过第三方年龄验证（不只是填出生日期）才能使用成人向角色。{verifyReady ? '' : '还没有接入验证服务，玩家只能等管理员在玩家详情页手动标记「已验证」。'}</span>
        </div>
      </section>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">年龄验证服务</h2>
        {status.verifyProviders.length ? (
          <ul className="p-small">{status.verifyProviders.map((item) => <li key={item.id}>{item.label} · {item.configured ? (item.active ? '使用中' : '已配置') : `未配置（${item.hint}）`}</li>)}</ul>
        ) : (
          <p className="p-small">还没有接入。接入方式：在 lib/age-verify/ 下实现一个服务商（Yoti、Veriff、Persona 等），在 index.ts 登记；回调地址为 /api/age-verify/&lt;id&gt;。</p>
        )}
      </section>

      <div style={{ marginTop: 16 }}>
        <button className="p-btn p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
      </div>
    </div>
  );
}
