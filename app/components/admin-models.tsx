'use client';
import { joinList } from '@/lib/i18n/runtime';

import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { useNotice } from '@/components/admin-feedback';
import { Select } from '@/components/ui-select';

type Meta = { name: string; summary: string; tags: string[]; context: string; featured: boolean; hidden: boolean; sort: number };
type Rule = { mode: 'token' | 'call'; price: number; tiers: { above: number; price: number }[] };
// 非对话模型的价格不在这里：生图/语音在「接口配置」各自的页面里设每次扣点
const KIND_NOTE: Record<string, string> = { image: '生图模型 · 价格在「接口配置 › 生图」里设（每张扣点）', tts: '语音模型 · 价格在「接口配置 › 语音」里设（每次扣点）', embedding: '向量模型 · 系统自动调用，不单独扣点' };

type Row = { id: string; kind?: string; source: string; isDefault: boolean; rule: Rule | null; priceLabel: string; meta: Meta };
type Mode = 'inherit' | 'token' | 'call';
type Draft = { id: string; kind: string; source: string; isDefault: boolean; mode: Mode; price: string; tiers: string; name: string; summary: string; tags: string; context: string; featured: boolean; hidden: boolean; sort: string };

const toDraft = (row: Row): Draft => ({
  id: row.id, kind: row.kind ?? 'chat', source: row.source, isDefault: row.isDefault,
  mode: row.rule ? row.rule.mode : 'inherit',
  price: row.rule ? String(row.rule.price) : '',
  tiers: row.rule ? joinList(row.rule.tiers.map((tier) => `${fmtK(tier.above)}=${tier.price}`), '，') : '',
  name: row.meta.name, summary: row.meta.summary, tags: joinList(row.meta.tags, '，'), context: row.meta.context,
  featured: row.meta.featured, hidden: row.meta.hidden, sort: String(row.meta.sort || ''),
});

const fmtK = (n: number) => (n >= 1_000_000 && n % 1_000_000 === 0 ? `${n / 1_000_000}M` : n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : String(n));

// 「272K=6，1M=10」→ [{above:272000, price:6}, …]；写错的段返回 null
function parseTiers(text: string): Rule['tiers'] | null {
  const out: Rule['tiers'] = [];
  for (const part of text.split(/[,，;；\n]+/).map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+(?:\.\d+)?)\s*([kKmM万]?)\s*[=:：]\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const mult = /[kK]/.test(match[2]) ? 1000 : /[mM]/.test(match[2]) ? 1_000_000 : match[2] === '万' ? 10_000 : 1;
    out.push({ above: Math.round(Number(match[1]) * mult), price: Number(match[3]) });
  }
  return out;
}

function draftRule(row: Draft): Rule | null | 'bad' {
  if (row.mode === 'inherit') return null;
  const price = Number(row.price);
  const tiers = parseTiers(row.tiers);
  if (row.price.trim() === '' || !Number.isFinite(price) || price < 0 || !tiers) return 'bad';
  return { mode: row.mode, price, tiers };
}

function preview(row: Draft, basePrice: number): string {
  const rule = draftRule(row);
  if (rule === 'bad') return '格式不对';
  if (!rule) return `${basePrice} 点/千 tokens（全局）`;
  const unit = rule.mode === 'call' ? '点/次' : '点/千 tokens';
  return [`${rule.price} ${unit}`, ...[...rule.tiers].sort((a, b) => a.above - b.above).map((tier) => `上下文超 ${fmtK(tier.above)}：${tier.price} ${unit}`)].join(' · ');
}

// 后台「模型广场」：每个模型单独设扣点价格（留空=跟随全局单价）、展示名、介绍、标签、推荐/下架
export function AdminModels({ initial }: { initial: { basePrice: number; models: Row[] } }) {
  const [basePrice, setBasePrice] = useState(initial.basePrice);
  const [rows, setRows] = useState<Draft[]>(initial.models.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setNotice = useNotice();

  const patch = (id: string, change: Partial<Draft>) => setRows((list) => list.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const save = async () => {
    setBusy(true);
    setError('');
    const bad = rows.find((row) => row.kind === 'chat' && draftRule(row) === 'bad');
    if (bad) {
      setBusy(false);
      setError(`「${bad.id}」的价格或分档格式不对（分档写法：272K=6，1M=10）`);
      return;
    }
    try {
      const result = await api<{ basePrice: number; models: Row[] }>('/api/admin/models', {
        method: 'PUT',
        body: JSON.stringify({
          models: rows.map((row) => ({
            id: row.id,
            rule: row.kind === 'chat' ? draftRule(row) : null,
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
      <p className="p-hint">计费参考 new-api：「按量」= 点 / 千 tokens（输入+输出合计，不足 1 点按 1 点）；「按次」= 每次生成固定扣点，和长短无关；「分档」按本次发给模型的上下文 tokens 切换价格，写法 272K=6，1M=10（超过 272K 按 6 扣，超过 1M 按 10 扣），留空 = 不分档。「上下文」一栏既是广场展示，也是这个模型的上下文上限（玩家的 context_size 不会超过它；留空按后台默认 32K）。「跟随全局」= 按量 {basePrice} 点。下架后广场和对话里都选不到，已选它的老会话回落到默认线路。</p>
      <div className="am-scroll">
        <table className="am-table">
          <thead>
            <tr><th>模型</th><th>计费</th><th>价格</th><th>上下文分档</th><th>展示名</th><th>一句话介绍</th><th>标签</th><th>上下文</th><th>排序</th><th>推荐</th><th>下架</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="am-id">{row.id}<div className="p-small">{row.source}{row.isDefault ? ' · 默认' : ''}</div></td>
                {row.kind !== 'chat' ? (
                  <td colSpan={3} className="am-kind-note">
                    <span className="p-small">{KIND_NOTE[row.kind] ?? '非对话模型'}</span>
                  </td>
                ) : (
                  <>
                <td>
                  <Select className="p-input am-mode" aria-label={`${row.id} 计费方式`} value={row.mode} onChange={(event) => patch(row.id, { mode: event.target.value as Mode, price: row.price || (event.target.value === 'inherit' ? '' : String(basePrice)) })}>
                    <option value="inherit">跟随全局</option>
                    <option value="token">按量</option>
                    <option value="call">按次</option>
                  </Select>
                </td>
                <td><input className="p-input am-num" inputMode="decimal" aria-label={`${row.id} 价格`} value={row.mode === 'inherit' ? '' : row.price} disabled={row.mode === 'inherit'} placeholder={String(basePrice)} onChange={(event) => patch(row.id, { price: event.target.value })} /></td>
                <td className="am-tiers">
                  <input className="p-input" aria-label={`${row.id} 上下文分档`} value={row.mode === 'inherit' ? '' : row.tiers} disabled={row.mode === 'inherit'} placeholder="272K=6" onChange={(event) => patch(row.id, { tiers: event.target.value })} />
                  <div className={`p-small${draftRule(row) === 'bad' ? ' am-bad' : ''}`}>{preview(row, basePrice)}</div>
                </td>
                  </>
                )}
                <td><input className="p-input" aria-label={`${row.id} 展示名`} value={row.name} maxLength={40} placeholder={row.id} onChange={(event) => patch(row.id, { name: event.target.value })} /></td>
                <td><input className="p-input" aria-label={`${row.id} 介绍`} value={row.summary} maxLength={160} placeholder="文笔细腻，适合长篇剧情" onChange={(event) => patch(row.id, { summary: event.target.value })} /></td>
                <td><input className="p-input" aria-label={`${row.id} 标签`} value={row.tags} placeholder="文笔，长上下文" onChange={(event) => patch(row.id, { tags: event.target.value })} /></td>
                <td><input className="p-input am-num" aria-label={`${row.id} 上下文`} disabled={row.kind !== 'chat'} value={row.kind !== 'chat' ? '' : row.context} maxLength={16} placeholder="200K" onChange={(event) => patch(row.id, { context: event.target.value })} /></td>
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
      </div>
    </section>
  );
}
