'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';
import { AdminEmbedding } from '@/components/admin-embedding';

type Plugin = { id: string; label: string; hint: string; configured: boolean; active: boolean };
type Status = {
  image: { baseUrl: string; model: string; size: string; cost: number; hasKey: boolean; keySource: 'own' | 'fallback' | 'none' };
  tts: { baseUrl: string; model: string; voice: string; cost: number; hasKey: boolean; keySource: 'own' | 'fallback' | 'none' };
  payment: { pricePerPointCents: number; provider: string; checkoutUrl: string; hasSecret: boolean; currency: string; providers: Plugin[]; storage: Plugin[] };
  billing: { textPer1k: number; upstreamCostPer1kCents: number; modelPrices?: string; models?: string[]; dailyFree?: number; firstTopupPct?: number; inviteReward?: number; inviteeBonus?: number; inviteMax?: number; rebatePct?: number; rebateDays?: number; defaultContext?: string; maxContext?: string };
  mail: { from: string; hasKey: boolean; mode: 'resend' | 'outbox' };
};

type Form = {
  image: { baseUrl: string; apiKey: string; model: string; size: string; cost: string };
  tts: { baseUrl: string; apiKey: string; model: string; voice: string; cost: string };
  payment: { pricePerPointCents: string; provider: string; checkoutUrl: string; secret: string };
  billing: { textPer1k: string; upstreamCostPer1kCents: string; modelPrices: string; dailyFree: string; firstTopupPct: string; inviteReward: string; inviteeBonus: string; inviteMax: string; rebatePct: string; rebateDays: string; defaultContext: string; maxContext: string };
  mail: { from: string; resendKey: string };
};

const EMPTY: Form = {
  image: { baseUrl: '', apiKey: '', model: '', size: '1024x1024', cost: '20' },
  tts: { baseUrl: '', apiKey: '', model: '', voice: 'alloy', cost: '5' },
  payment: { pricePerPointCents: '1', provider: '', checkoutUrl: '', secret: '' },
  billing: { textPer1k: '2', upstreamCostPer1kCents: '0', modelPrices: '', dailyFree: '0', firstTopupPct: '0', inviteReward: '0', inviteeBonus: '0', inviteMax: '50', rebatePct: '0', rebateDays: '0', defaultContext: '', maxContext: '' },
  mail: { from: '', resendKey: '' },
};

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 22, padding: '0 10px', fontSize: 11, color: ok ? 'var(--ok, #2e7d43)' : 'var(--muted)' }}>
      {text}
    </span>
  );
}

export function AdminSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<{ kind: string; url?: string; error?: string } | null>(null);
  const [models, setModels] = useState<{ image: string[]; tts: string[] }>({ image: [], tts: [] });
  const [fetching, setFetching] = useState<'image' | 'tts' | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await api<Status>('/api/admin/settings');
      setStatus(data);
      setForm({
        image: { baseUrl: data.image.baseUrl, apiKey: '', model: data.image.model, size: data.image.size, cost: String(data.image.cost) },
        tts: { baseUrl: data.tts.baseUrl, apiKey: '', model: data.tts.model, voice: data.tts.voice, cost: String(data.tts.cost) },
        payment: { pricePerPointCents: String(data.payment.pricePerPointCents), provider: data.payment.provider, checkoutUrl: data.payment.checkoutUrl, secret: '' },
        billing: { textPer1k: String(data.billing.textPer1k), upstreamCostPer1kCents: String(data.billing.upstreamCostPer1kCents), modelPrices: data.billing.modelPrices ?? '', dailyFree: String(data.billing.dailyFree ?? 0), firstTopupPct: String(data.billing.firstTopupPct ?? 0), inviteReward: String(data.billing.inviteReward ?? 0), inviteeBonus: String(data.billing.inviteeBonus ?? 0), inviteMax: String(data.billing.inviteMax ?? 50), rebatePct: String(data.billing.rebatePct ?? 0), rebateDays: String(data.billing.rebateDays ?? 0), defaultContext: data.billing.defaultContext ?? '', maxContext: data.billing.maxContext ?? '' },
        mail: { from: data.mail.from, resendKey: '' },
      });
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (group: 'image' | 'tts' | 'payment' | 'mail' | 'billing', clear: string[] = []) => {
    setBusy(group);
    setError('');
    setNotice('');
    try {
      const data = await api<Status>('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ [group]: { ...form[group], clear } }) });
      setStatus(data);
      setForm((prev) => ({
        ...prev,
        image: group === 'image' ? { ...prev.image, apiKey: '' } : prev.image,
        tts: group === 'tts' ? { ...prev.tts, apiKey: '' } : prev.tts,
        payment: group === 'payment' ? { ...prev.payment, secret: '' } : prev.payment,
        mail: group === 'mail' ? { ...prev.mail, resendKey: '' } : prev.mail,
      }));
      setNotice(group === 'billing' ? '计费配置已保存。' : group === 'mail' ? '邮件配置已保存。' : '已保存。密钥留空表示不修改。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const runTest = async (kind: 'image' | 'tts') => {
    setBusy('test-' + kind);
    setTest(null);
    setError('');
    try {
      const data = await api<{ url: string }>('/api/admin/settings/test', { method: 'POST', body: JSON.stringify({ kind }) });
      setTest({ kind, url: data.url });
    } catch (caught) {
      setTest({ kind, error: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  // 从上游 /models 拉取模型，拉不到时仍可手填（兼容不实现 /models 的网关）
  const fetchModels = async (kind: 'image' | 'tts') => {
    setFetching(kind);
    setError('');
    try {
      const data = await api<{ models: string[] }>('/api/admin/channels/models', {
        method: 'POST',
        body: JSON.stringify({ baseUrl: form[kind].baseUrl, apiKey: form[kind].apiKey, kind }),
      });
      setModels((prev) => ({ ...prev, [kind]: data.models }));
      setForm((prev) => ({
        ...prev,
        [kind]: { ...prev[kind], model: data.models.includes(prev[kind].model) ? prev[kind].model : (data.models[0] ?? '') },
      }));
      setNotice(`${kind === 'image' ? '生图' : '语音'}：获取到 ${data.models.length} 个模型，从下拉框选择即可。`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setFetching(null);
    }
  };

  const imageReady = Boolean(status?.image.baseUrl && status?.image.model && status?.image.keySource !== 'none');
  const ttsReady = Boolean(status?.tts.baseUrl && status?.tts.model && status?.tts.keySource !== 'none');
  const keyPlaceholder = (source?: 'own' | 'fallback' | 'none') =>
    source === 'own' ? '已保存，留空不变' : source === 'fallback' ? '将使用模型 Key' : '未设置';

  return (
    <>
      <ErrorLine message={error} />
      {notice && <p className="admin-toast" role="status">{notice}</p>}

      <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>生图</h2>
          <Badge ok={imageReady} text={imageReady ? '已配置' : '未配置'} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>OpenAI 兼容的 `/images/generations`。不配置时对话页不显示「生图」按钮。</p>
        <div className="p-field-row">
          <div className="p-field"><label>Base URL</label><input aria-label="Base URL" className="p-input" value={form.image.baseUrl} placeholder="https://…/v1" onChange={(event) => setForm({ ...form, image: { ...form.image, baseUrl: event.target.value } })} /></div>
          <div className="p-field"><label>API Key（留空不改）</label><input aria-label="API Key（留空不改）" className="p-input" type="password" value={form.image.apiKey} placeholder={keyPlaceholder(status?.image.keySource)} onChange={(event) => setForm({ ...form, image: { ...form.image, apiKey: event.target.value } })} /></div>
          <div className="p-field">
            <label>模型名</label>
            {models.image.length ? (
              <Select className="p-select" value={form.image.model} onChange={(event) => setForm({ ...form, image: { ...form.image, model: event.target.value } })}>
                {[...(form.image.model && !models.image.includes(form.image.model) ? [form.image.model] : []), ...models.image].map((model) => <option key={model} value={model}>{model}</option>)}
              </Select>
            ) : (
              <input aria-label="模型名" className="p-input" value={form.image.model} placeholder="例如：gpt-image-1" onChange={(event) => setForm({ ...form, image: { ...form.image, model: event.target.value } })} />
            )}
            <span style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button className="p-text-btn" type="button" style={{ fontSize: 12 }} disabled={fetching === 'image' || !form.image.baseUrl} onClick={() => void fetchModels('image')}>{fetching === 'image' ? '获取中…' : models.image.length ? '重新获取模型' : '获取模型'}</button>
              {models.image.length > 0 && <button className="p-text-btn" type="button" style={{ fontSize: 12 }} onClick={() => setModels((prev) => ({ ...prev, image: [] }))}>改用手填</button>}
            </span>
          </div>
          <div className="p-field"><label>尺寸</label><input aria-label="尺寸" className="p-input" value={form.image.size} onChange={(event) => setForm({ ...form, image: { ...form.image, size: event.target.value } })} /></div>
          <div className="p-field"><label>每张扣点</label><input aria-label="每张扣点" className="p-input" type="number" min={0} value={form.image.cost} onChange={(event) => setForm({ ...form, image: { ...form.image, cost: event.target.value } })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'image'} onClick={() => void save('image')}>{busy === 'image' ? '保存中…' : '保存生图配置'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'test-image' || !imageReady} onClick={() => void runTest('image')}>{busy === 'test-image' ? '测试中…' : '测试（会真实生成一张）'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'image' || status?.image.keySource !== 'own'} onClick={() => void save('image', ['apiKey'])}>清除密钥</button>
        </div>
        {test?.kind === 'image' && (
          test.url
            ? <p className="small" style={{ margin: '10px 0 0' }}>测试成功：<a href={test.url} target="_blank" rel="noreferrer">查看图片</a></p>
            : <p className="small" style={{ margin: '10px 0 0', color: 'var(--danger)' }}>{test.error}</p>
        )}
      </section>

      <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>语音（TTS）</h2>
          <Badge ok={ttsReady} text={ttsReady ? '已配置' : '未配置'} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>OpenAI 兼容的 `/audio/speech`。不配置时消息上不显示「朗读」。</p>
        <div className="p-field-row">
          <div className="p-field"><label>Base URL</label><input aria-label="Base URL" className="p-input" value={form.tts.baseUrl} placeholder="https://…/v1" onChange={(event) => setForm({ ...form, tts: { ...form.tts, baseUrl: event.target.value } })} /></div>
          <div className="p-field"><label>API Key（留空不改）</label><input aria-label="API Key（留空不改）" className="p-input" type="password" value={form.tts.apiKey} placeholder={keyPlaceholder(status?.tts.keySource)} onChange={(event) => setForm({ ...form, tts: { ...form.tts, apiKey: event.target.value } })} /></div>
          <div className="p-field">
            <label>模型名</label>
            {models.tts.length ? (
              <Select className="p-select" value={form.tts.model} onChange={(event) => setForm({ ...form, tts: { ...form.tts, model: event.target.value } })}>
                {[...(form.tts.model && !models.tts.includes(form.tts.model) ? [form.tts.model] : []), ...models.tts].map((model) => <option key={model} value={model}>{model}</option>)}
              </Select>
            ) : (
              <input aria-label="模型名" className="p-input" value={form.tts.model} placeholder="例如：tts-1" onChange={(event) => setForm({ ...form, tts: { ...form.tts, model: event.target.value } })} />
            )}
            <span style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button className="p-text-btn" type="button" style={{ fontSize: 12 }} disabled={fetching === 'tts' || !form.tts.baseUrl} onClick={() => void fetchModels('tts')}>{fetching === 'tts' ? '获取中…' : models.tts.length ? '重新获取模型' : '获取模型'}</button>
              {models.tts.length > 0 && <button className="p-text-btn" type="button" style={{ fontSize: 12 }} onClick={() => setModels((prev) => ({ ...prev, tts: [] }))}>改用手填</button>}
            </span>
          </div>
          <div className="p-field"><label>音色</label><input aria-label="音色" className="p-input" value={form.tts.voice} placeholder="alloy" onChange={(event) => setForm({ ...form, tts: { ...form.tts, voice: event.target.value } })} /></div>
          <div className="p-field"><label>每次扣点</label><input aria-label="每次扣点" className="p-input" type="number" min={0} value={form.tts.cost} onChange={(event) => setForm({ ...form, tts: { ...form.tts, cost: event.target.value } })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'tts'} onClick={() => void save('tts')}>{busy === 'tts' ? '保存中…' : '保存语音配置'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'test-tts' || !ttsReady} onClick={() => void runTest('tts')}>{busy === 'test-tts' ? '测试中…' : '测试（会真实合成一句）'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'tts' || status?.tts.keySource !== 'own'} onClick={() => void save('tts', ['apiKey'])}>清除密钥</button>
        </div>
        {test?.kind === 'tts' && (
          test.url
            ? <p className="small" style={{ margin: '10px 0 0' }}>测试成功：<a href={test.url} target="_blank" rel="noreferrer">播放语音</a></p>
            : <p className="small" style={{ margin: '10px 0 0', color: 'var(--danger)' }}>{test.error}</p>
        )}
      </section>

      <AdminEmbedding />

      <section className="p-card p-card--pad" id="billing" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>点数计费</h2>
          <Badge ok={Number(form.billing.textPer1k) > 0} text={`${form.billing.textPer1k || 0} 点 / 1000 tokens`} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>文本模型每 1000 tokens 扣多少点；不足 1 点按 1 点算。生图与语音的扣点在各自主卡片里。</p>
        <div className="p-field-row">
          <div className="p-field">
            <label>文本模型 · 每 1000 tokens 扣点</label>
            <input aria-label="文本模型 · 每 1000 tokens 扣点" className="p-input" type="number" min={0} step={0.1} value={form.billing.textPer1k} onChange={(event) => setForm({ ...form, billing: { ...form.billing, textPer1k: event.target.value } })} />
          </div>
          <div className="p-field">
            <label>上游成本 · 每 1000 tokens（分）</label>
            <input aria-label="上游成本 · 每 1000 tokens（分）" className="p-input" type="number" min={0} step={0.1} value={form.billing.upstreamCostPer1kCents} onChange={(event) => setForm({ ...form, billing: { ...form.billing, upstreamCostPer1kCents: event.target.value } })} />
            <span className="p-small">用于后台粗算毛利；0 表示不计算。</span>
          </div>
        </div>
        <div className="p-field">
          <label htmlFor="model-prices">按模型定价（每行 模型id=每千 tokens 点数；没写的模型用上面的统一价）</label>
          <textarea id="model-prices" className="p-textarea" rows={5} value={form.billing.modelPrices} placeholder={'claude-sonnet-4.5=6\ndeepseek-r1=3\ngpt-4o-mini=1'} onChange={(event) => setForm({ ...form, billing: { ...form.billing, modelPrices: event.target.value } })} />
          {status?.billing.models?.length ? <span className="p-small">当前可选模型：{status.billing.models.join('、')}</span> : null}
        </div>
        <h3 className="p-form-section-title" style={{ margin: '18px 0 4px', fontSize: 14 }}>上下文长度</h3>
        <p className="small" style={{ marginTop: 0 }}>每个模型的上限在「模型广场」里填（如 200K）。玩家可在预设里把 context_size 调小，不会超过模型上限。可写 32K、1M 或纯数字，留空用默认。</p>
        <div className="p-field-row">
          {([
            ['defaultContext', '没标上限的模型（tokens）', '默认 32K'],
            ['maxContext', '全站封顶（tokens）', '留空不封顶；设了以后谁都不能超过它'],
          ] as const).map(([key, label, hint]) => (
            <div className="p-field" key={key}>
              <label htmlFor={`ctx-${key}`}>{label}</label>
              <input id={`ctx-${key}`} className="p-input" value={form.billing[key]} placeholder={key === 'defaultContext' ? '32K' : '不封顶'} onChange={(event) => setForm({ ...form, billing: { ...form.billing, [key]: event.target.value } })} />
              <span className="p-small">{hint}</span>
            </div>
          ))}
        </div>
        <h3 className="p-form-section-title" style={{ margin: '18px 0 4px', fontSize: 14 }}>福利与增长</h3>
        <p className="small" style={{ marginTop: 0 }}>填 0 表示关闭，用户端不会显示。改动立即生效。</p>
        <div className="p-field-row">
          {([
            ['dailyFree', '每日免费额度（点）', '每人每天生成时先抵扣这么多点，零点刷新'],
            ['firstTopupPct', '首充赠送（%）', '第一笔充值到账时额外送的百分比'],
            ['inviteeBonus', '被邀请人见面礼（点）', '用好友链接注册即到账'],
            ['inviteReward', '邀请人奖励（点）', '好友第一次生成后到账'],
            ['inviteMax', '邀请奖励上限（次）', '每位邀请人最多拿几次奖励'],
            ['rebatePct', '邀请返点（%）', '好友每笔充值到账，按比例返给邀请人；退款时扣回'],
            ['rebateDays', '返点期限（天）', '好友注册后多少天内的充值才返，0 为不限'],
          ] as const).map(([key, label, hint]) => (
            <div className="p-field" key={key}>
              <label htmlFor={`growth-${key}`}>{label}</label>
              <input id={`growth-${key}`} className="p-input" type="number" min={0} step={1} value={form.billing[key]} onChange={(event) => setForm({ ...form, billing: { ...form.billing, [key]: event.target.value } })} />
              <span className="p-small">{hint}</span>
            </div>
          ))}
        </div>
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'billing'} onClick={() => void save('billing', form.billing.modelPrices.trim() ? [] : ['modelPrices'])}>{busy === 'billing' ? '保存中…' : '保存计费配置'}</button>
      </section>

      <section className="p-card p-card--pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>支付渠道</h2>
          <Badge ok text={`当前：${status?.payment.providers.find((item) => item.active)?.label ?? '手动确认'}`} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>
          插件式：每个渠道在 <code>lib/payments/</code> 一个文件，回调地址 <code>/api/payments/&lt;id&gt;</code>。选中的渠道没配好时自动退到下一个已配置的，最后是手动确认。币种 {status?.payment.currency}。
        </p>
        <PluginList items={status?.payment.providers ?? []} />
        <div className="p-field-row">
          <div className="p-field"><label>每点价格（分）</label><input aria-label="每点价格（分）" className="p-input" type="number" min={1} value={form.payment.pricePerPointCents} onChange={(event) => setForm({ ...form, payment: { ...form.payment, pricePerPointCents: event.target.value } })} /></div>
          <div className="p-field"><label>收款渠道</label><Select aria-label="收款渠道" className="p-input" value={form.payment.provider} onChange={(event) => setForm({ ...form, payment: { ...form.payment, provider: event.target.value } })}><option value="">自动（第一个已配置的）</option>{(status?.payment.providers ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}{item.configured ? '' : '（未配置）'}</option>)}</Select></div>
          <div className="p-field"><label>通用结算页回调密钥（留空不改）</label><input aria-label="回调密钥（留空不改）" className="p-input" type="password" value={form.payment.secret} placeholder={status?.payment.hasSecret ? '已保存，留空不变' : '未设置'} onChange={(event) => setForm({ ...form, payment: { ...form.payment, secret: event.target.value } })} /></div>
          <div className="p-field"><label>通用结算页 URL</label><input aria-label="结算页 URL（选填）" className="p-input" value={form.payment.checkoutUrl} placeholder="https://pay.example.com/checkout" onChange={(event) => setForm({ ...form, payment: { ...form.payment, checkoutUrl: event.target.value } })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'payment'} onClick={() => void save('payment')}>{busy === 'payment' ? '保存中…' : '保存支付配置'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'payment' || !status?.payment.hasSecret} onClick={() => void save('payment', ['secret'])}>清除密钥</button>
        </div>
      </section>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>媒体存储</h2>
          <Badge ok text={`当前：${status?.payment.storage.find((item) => item.active)?.label ?? '本地磁盘'}`} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>
          插件式：每个驱动在 <code>lib/storage-drivers/</code> 一个文件。用环境变量 <code>TAVERN_STORAGE_DRIVER</code> 指定，留空自动选第一个已配置的；密钥只走环境变量。
        </p>
        <PluginList items={status?.payment.storage ?? []} />
      </section>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>邮件</h2>
          <Badge ok={status?.mail.mode === 'resend'} text={status?.mail.mode === 'resend' ? 'Resend 已配置' : '本地 outbox（不真的发信）'} />
        </div>
        <p className="small" style={{ marginTop: 0 }}>
          用于找回密码与邮箱验证。配置 Resend 后会真的发信；未配置时邮件写到 <code>.data/outbox/</code>，便于本地查看链接。
        </p>
        <div className="p-field-row">
          <div className="p-field"><label>发件人</label><input aria-label="发件人" className="p-input" value={form.mail.from} placeholder="夜话 <no-reply@example.com>" onChange={(event) => setForm({ ...form, mail: { ...form.mail, from: event.target.value } })} /></div>
          <div className="p-field"><label>Resend API Key（留空不改）</label><input aria-label="Resend API Key（留空不改）" className="p-input" type="password" value={form.mail.resendKey} placeholder={status?.mail.hasKey ? '已保存，留空不变' : '未设置'} onChange={(event) => setForm({ ...form, mail: { ...form.mail, resendKey: event.target.value } })} /></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'mail'} onClick={() => void save('mail')}>{busy === 'mail' ? '保存中…' : '保存邮件配置'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'mail' || !status?.mail.hasKey} onClick={() => void save('mail', ['resendKey'])}>清除密钥</button>
        </div>
      </section>
    </>
  );
}

function PluginList({ items }: { items: Plugin[] }) {
  return (
    <ul className="p-plugin-list">
      {items.map((item) => (
        <li key={item.id} className={item.active ? 'is-active' : undefined}>
          <span className="p-plugin-name"><b>{item.label}</b> <code>{item.id}</code></span>
          <span className="p-plugin-state">{item.active ? '使用中' : item.configured ? '已配置' : '未配置'}</span>
          <span className="p-plugin-hint small">{item.hint}</span>
        </li>
      ))}
    </ul>
  );
}
