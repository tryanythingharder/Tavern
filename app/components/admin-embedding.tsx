'use client';

import { useEffect, useState } from 'react';
import { api } from '@/components/settings-ui';

type Status = { baseUrl: string; model: string; hasKey: boolean; ready: boolean; stored: number };

// 后台「向量记忆」：OpenAI 兼容的 /embeddings。配好后聊天里的记忆检索改用向量相似度（对应 ST 的 Vector Storage）。
export function AdminEmbedding() {
  const [status, setStatus] = useState<Status | null>(null);
  const [form, setForm] = useState({ baseUrl: '', apiKey: '', model: '' });
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'clear'>('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (next: Status) => {
    setStatus(next);
    setForm({ baseUrl: next.baseUrl, apiKey: '', model: next.model });
  };

  useEffect(() => { void api<Status>('/api/admin/embedding').then(apply).catch(() => undefined); }, []);

  const save = async (clearKey = false) => {
    setBusy(clearKey ? 'clear' : 'save');
    setNote(null);
    try {
      apply(await api<Status>('/api/admin/embedding', { method: 'PATCH', body: JSON.stringify({ ...form, clearKey }) }));
      setNote({ ok: true, text: clearKey ? '已清除密钥。' : '已保存。' });
    } catch (caught) {
      setNote({ ok: false, text: (caught as Error).message });
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setNote(null);
    try {
      const result = await api<{ dimensions: number }>('/api/admin/embedding', { method: 'POST' });
      setNote({ ok: true, text: `连接成功，向量维度 ${result.dimensions}。` });
    } catch (caught) {
      setNote({ ok: false, text: (caught as Error).message });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="p-card p-card--pad" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <h2 className="p-form-section-title" style={{ margin: 0 }}>向量记忆</h2>
        <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 22, padding: '0 10px', fontSize: 11, color: status?.ready ? 'var(--ok, #2e7d43)' : 'var(--muted)' }}>{status?.ready ? '已配置' : '未配置'}</span>
      </div>
      <p className="small" style={{ marginTop: 0 }}>
        OpenAI 兼容的 <code>/embeddings</code>（如 text-embedding-3-small、bge-m3）。配好后，聊天的「记忆检索」改用向量相似度从更早的楼层召回内容；不配置时用关键词近似。向量不扣玩家点数。
        {status && status.stored > 0 ? ` 已缓存 ${status.stored} 条楼层向量。` : ''}
      </p>
      <div className="p-field-row">
        <div className="p-field"><label>Base URL</label><input aria-label="Base URL" className="p-input" value={form.baseUrl} placeholder="https://…/v1" onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} /></div>
        <div className="p-field"><label>API Key（留空不改）</label><input aria-label="API Key（留空不改）" className="p-input" type="password" value={form.apiKey} placeholder={status?.hasKey ? '已保存，留空不变' : '未设置'} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} /></div>
        <div className="p-field"><label>模型名</label><input aria-label="模型名" className="p-input" value={form.model} placeholder="例如：text-embedding-3-small" onChange={(event) => setForm({ ...form, model: event.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy !== ''} onClick={() => void save()}>{busy === 'save' ? '保存中…' : '保存向量配置'}</button>
        <button className="p-btn p-btn--sm" type="button" disabled={busy !== '' || !status?.ready} onClick={() => void test()}>{busy === 'test' ? '测试中…' : '测试连接'}</button>
        <button className="p-btn p-btn--sm" type="button" disabled={busy !== '' || !status?.hasKey} onClick={() => void save(true)}>清除密钥</button>
      </div>
      {note && <p className="small" style={{ margin: '10px 0 0', color: note.ok ? undefined : 'var(--danger)' }}>{note.text}</p>}
    </section>
  );
}
