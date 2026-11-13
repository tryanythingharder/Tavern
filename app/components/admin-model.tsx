'use client';

import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type ModelStatus = {
  baseUrl: string;
  name: string;
  hasKey: boolean;
  fallbackCount: number;
  fallbackRoutes: { baseUrl: string; model: string }[];
};

export function AdminModel({ initial }: { initial: ModelStatus }) {
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [name, setName] = useState(initial.name);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(initial.hasKey);
  const [fallbacks, setFallbacks] = useState('');
  const [routes, setRoutes] = useState(initial.fallbackRoutes ?? []);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [testText, setTestText] = useState('');

  const save = async () => {
    setBusy('save');
    setError('');
    setNotice('');
    try {
      if (fallbacks.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(fallbacks);
        } catch {
          throw new Error('备用线路不是合法 JSON，请检查格式');
        }
        if (!Array.isArray(parsed)) throw new Error('备用线路必须是 JSON 数组');
      }
      const result = await api<{ model: ModelStatus }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ model: fallbacks.trim() ? { baseUrl, name, apiKey, fallbacks } : { baseUrl, name, apiKey } }),
      });
      if (apiKey) setHasKey(true);
      setApiKey('');
      setFallbacks('');
      setRoutes(result.model?.fallbackRoutes ?? routes);
      setNotice(fallbacks.trim() ? '已保存，备用线路已替换。密钥留空表示不修改。' : '已保存。密钥留空表示不修改。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    setError('');
    setNotice('');
    setTestText('');
    try {
      const result = await api<{ text: string }>('/api/admin/settings/test', { method: 'POST', body: JSON.stringify({ kind: 'model' }) });
      setTestText(result.text || '（模型没有返回正文）');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const ready = Boolean(baseUrl && name && hasKey);

  return (
    <>
      <ErrorLine message={error} />
      {notice && <p className="admin-toast" role="status">{notice}</p>}
      <section className="p-card p-card--pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <h2 className="p-form-section-title" style={{ margin: 0 }}>文本模型</h2>
          <span className={`p-pill p-pill--sm ${ready ? 'p-pill--ok' : 'p-pill--warn'}`}>{ready ? '已配置' : '未配置'}</span>
        </div>
        <p className="small" style={{ marginTop: 0 }}>OpenAI 兼容的 `/chat/completions`。保存后立即生效，不需要重启；密钥只写不读。</p>
        <div className="p-field-row">
          <div className="p-field"><label>Base URL</label><input aria-label="Base URL" className="p-input" value={baseUrl} placeholder="https://…/v1" onChange={(event) => setBaseUrl(event.target.value)} /></div>
          <div className="p-field"><label>模型</label><input aria-label="模型" className="p-input" value={name} placeholder="例如：deepseek-v4.1-flash" onChange={(event) => setName(event.target.value)} /></div>
          <div className="p-field"><label>API Key（留空不改）</label><input aria-label="API Key（留空不改）" className="p-input" type="password" value={apiKey} placeholder={hasKey ? '已保存，留空不变' : '未设置'} onChange={(event) => setApiKey(event.target.value)} /></div>
        </div>
        <details style={{ margin: '12px 0' }}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
            备用线路（可选）{routes.length ? ` · 已生效 ${routes.length} 条` : ''}
          </summary>
          <p className="small" style={{ margin: '8px 0' }}>
            主线路报错或超时时依次切换到这里。JSON 数组，每条需要 <code>baseUrl</code>、<code>apiKey</code>、<code>model</code>；最多 5 条。留空并保存不会清除已有线路。
          </p>
          {routes.length > 0 && (
            <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
              {routes.map((route) => (
                <li key={`${route.baseUrl}|${route.model}`}><code>{route.model}</code> · {route.baseUrl}</li>
              ))}
            </ul>
          )}
          <div className="p-field">
            <label htmlFor="model-fallbacks">备用线路 JSON（留空不改）</label>
            <textarea
              id="model-fallbacks"
              className="p-input"
              rows={4}
              spellCheck={false}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
              placeholder={'[{"baseUrl":"https://other.example/v1","apiKey":"sk-…","model":"gpt-4o-mini"}]'}
              value={fallbacks}
              onChange={(event) => setFallbacks(event.target.value)}
            />
          </div>
          <p className="p-hint">要清空备用线路，请填写 <code>[]</code> 后保存。</p>
        </details>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'save'} onClick={() => void save()}>{busy === 'save' ? '保存中…' : '保存模型配置'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === 'test' || !ready} onClick={() => void test()}>{busy === 'test' ? '测试中…' : '测试连接（会真实生成一句）'}</button>
        </div>
        {testText && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>测试成功：{testText}</p>}
      </section>
    </>
  );
}
