'use client';

import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Meta = { name: string; summary: string; tags: string[]; context: string; featured: boolean; hidden: boolean; sort: number };
type Row = { id: string; source: string; isDefault: boolean; price: number; ownPrice: boolean; meta: Meta };
type Draft = { id: string; source: string; isDefault: boolean; price: string; name: string; summary: string; tags: string; context: string; featured: boolean; hidden: boolean; sort: string };

const toDraft = (row: Row): Draft => ({
  id: row.id, source: row.source, isDefault: row.isDefault,
  price: row.ownPrice ? String(row.price) : '',
  name: row.meta.name, summary: row.meta.summary, tags: row.meta.tags.join('，'), context: row.meta.context,
  featured: row.meta.featured, hidden: row.meta.hidden, sort: String(row.meta.sort || ''),
});

// 后台「模型广场」：每个模型单独设扣点价格（留空=跟随全局单价）、展示名、介绍、标签、推荐/下架
export function AdminModels({ initial }: { initial: { basePrice: number; models: Row[] } }) {
  const [basePrice, setBasePrice] = useState(initial.basePrice);
  const [rows, setRows] = useState<Draft[]>(initial.models.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const patch = (id: string, change: Partial<Draft>) => setRows((list) => list.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ basePrice: number; models: Row[] }>('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          models: rows.map((row) => ({
            id: row.id,
            price: row.price.trim() === '' ? null : row.price,
            meta: { name: row.name, summary: row.summary, tags: row.tags, context: row.context, featured: row.featured, hidden: row.hidden, sort: Number(row.sort) || 0 },
          })),
        }),
      });
      setBasePrice(result.basePrice);
      setRows(result.models.map(toDraft));
      setNotice('已保存，模型广场和对话里的价格立即生效');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!rows.length) {
    return (
      <div className="p-empty">
        <div className="p-empty-title">还没有可用模型</div>
        <p className="p-empty-text">先在「渠道」里接入上游并填写模型列表，这里会自动列出。</p>
      </div>
    );
  }

  return (
    <section className="p-card p-card--pad">
      <ErrorLine message={error} />
      <p className="p-hint">价格单位：点 / 千 tokens（输入+输出合计）。留空 = 跟随全局单价 {basePrice} 点。下架后广场和对话里都选不到，已选它的老会话回落到默认线路。</p>
      <div className="am-scroll">
        <table className="am-table">
          <thead>
            <tr><th>模型</th><th>价格</th><th>展示名</th><th>一句话介绍</th><th>标签</th><th>上下文</th><th>排序</th><th>推荐</th><th>下架</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="am-id">{row.id}<div className="p-small">{row.source}{row.isDefault ? ' · 默认' : ''}</div></td>
                <td><input className="p-input am-num" inputMode="decimal" aria-label={`${row.id} 价格`} value={row.price} placeholder={String(basePrice)} onChange={(event) => patch(row.id, { price: event.target.value })} /></td>
                <td><input className="p-input" aria-label={`${row.id} 展示名`} value={row.name} maxLength={40} placeholder={row.id} onChange={(event) => patch(row.id, { name: event.target.value })} /></td>
                <td><input className="p-input" aria-label={`${row.id} 介绍`} value={row.summary} maxLength={160} placeholder="文笔细腻，适合长篇剧情" onChange={(event) => patch(row.id, { summary: event.target.value })} /></td>
                <td><input className="p-input" aria-label={`${row.id} 标签`} value={row.tags} placeholder="文笔，长上下文" onChange={(event) => patch(row.id, { tags: event.target.value })} /></td>
                <td><input className="p-input am-num" aria-label={`${row.id} 上下文`} value={row.context} maxLength={16} placeholder="200K" onChange={(event) => patch(row.id, { context: event.target.value })} /></td>
                <td><input className="p-input am-num" inputMode="numeric" aria-label={`${row.id} 排序`} value={row.sort} placeholder="0" onChange={(event) => patch(row.id, { sort: event.target.value })} /></td>
                <td><input type="checkbox" aria-label={`${row.id} 推荐`} checked={row.featured} onChange={(event) => patch(row.id, { featured: event.target.checked })} /></td>
                <td><input type="checkbox" aria-label={`${row.id} 下架`} checked={row.hidden} onChange={(event) => patch(row.id, { hidden: event.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
        {notice && <span className="p-small" role="status">{notice}</span>}
      </div>
    </section>
  );
}
