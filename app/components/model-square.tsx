'use client';

import Link from 'next/link';
import { currentLocale, tr } from '@/lib/i18n/runtime';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Select } from '@/components/ui-select';
import { ModelDefaultButton } from '@/components/model-default-button';
import type { Vendor } from '@/lib/model-vendor';

export type SquareModel = {
  id: string; name: string; summary: string; tags: string[]; traits: string[];
  context: string; contextDefault?: boolean; contextTokens: number; featured: boolean; siteDefault: boolean; mine: boolean;
  mode: 'token' | 'call'; price: number; tiers: { above: number; price: number }[]; priceLabel: string;
  vendor: Vendor; order: number;
};

type Sort = 'recommend' | 'price-asc' | 'price-desc' | 'context';
type View = 'card' | 'list';

const fmt = (value: number) => (Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }));
const kTokens = (value: number) => (value >= 1_000_000 ? `${fmt(value / 1_000_000)}M` : `${fmt(Math.round(value / 1000))}K`);
// 一条回复大约 1–3 千 tokens（含上下文），按量模型给个直观的区间
const perReply = (item: SquareModel) => (item.mode === 'call' ? `${fmt(item.price)} 点` : `${fmt(Math.max(1, Math.ceil(item.price)))}–${fmt(Math.max(1, Math.ceil(item.price * 3)))} 点`);

function VendorMark({ vendor, size = 40 }: { vendor: Vendor; size?: number }) {
  return <span className="ms-mark" style={{ ['--ms-c' as string]: vendor.color, width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{vendor.mark}</span>;
}

function PriceBlock({ item, big = false }: { item: SquareModel; big?: boolean }) {
  return (
    <div className={`ms-price${big ? ' ms-price--big' : ''}`}>
      <span className="ms-price-n">{fmt(item.price)}</span>
      <span className="ms-price-u">{item.mode === 'call' ? '点 / 次' : '点 / 千 tokens'}</span>
    </div>
  );
}

// 后台没写介绍时，按模型名和特点拼一句（不写「暂无介绍」）
function autoSummary(item: { id: string; traits: string[] }): string {
  const parts: string[] = [];
  if (/flash|mini|lite|turbo|haiku|nano|small|instant/i.test(item.id)) parts.push('响应快、价格低，适合日常闲聊和长时间陪聊');
  else if (/opus|pro\b|-pro|max|large|ultra|sonnet/i.test(item.id)) parts.push('文笔和理解力更强，适合复杂剧情与细腻描写');
  if (item.traits.includes('深度思考')) parts.push('会先思考再回答，推理和伏笔处理更稳');
  if (item.traits.includes('长上下文')) parts.push('能记住更长的对话');
  if (item.traits.includes('识图')) parts.push('可以看图');
  if (!parts.length) parts.push('通用对话模型，适合日常角色扮演');
  if (currentLocale() === 'en') return `${parts.map((part) => tr(part)).join(', ')}.`;
  return `${parts.join('，')}。`;
}

export function ModelSquare({ models, signedIn, hasMine }: { models: SquareModel[]; signedIn: boolean; hasMine: boolean }) {
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState('all');
  const [mode, setMode] = useState<'all' | 'token' | 'call'>('all');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<Sort>('recommend');
  const [view, setView] = useState<View>('card');
  const [open, setOpen] = useState<SquareModel | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    try { const saved = localStorage.getItem('tavern:models-view'); if (saved === 'list' || saved === 'card') setView(saved); } catch { /* ignore */ }
  }, []);
  const pickView = (value: View) => { setView(value); try { localStorage.setItem('tavern:models-view', value); } catch { /* ignore */ } };

  const vendors = useMemo(() => {
    const map = new Map<string, { vendor: Vendor; count: number }>();
    for (const item of models) {
      const hit = map.get(item.vendor.key);
      if (hit) hit.count += 1; else map.set(item.vendor.key, { vendor: item.vendor, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.vendor.name.localeCompare(b.vendor.name));
  }, [models]);
  const tags = useMemo(() => [...new Set(models.flatMap((item) => [...item.traits, ...item.tags]))], [models]);
  const hasCall = models.some((item) => item.mode === 'call');
  const hasToken = models.some((item) => item.mode === 'token');
  const cheapest = useMemo(() => {
    const pool = models.filter((item) => item.mode === 'token');
    return pool.length ? Math.min(...pool.map((item) => item.price)) : null;
  }, [models]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = models.filter((item) =>
      (vendor === 'all' || item.vendor.key === vendor)
      && (mode === 'all' || item.mode === mode)
      && (!tag || item.tags.includes(tag) || item.traits.includes(tag))
      && (!q || `${item.name} ${item.id} ${item.summary} ${item.tags.join(' ')} ${item.vendor.name}`.toLowerCase().includes(q)));
    const byPrice = (a: SquareModel, b: SquareModel) => (a.mode === b.mode ? a.price - b.price : a.mode === 'token' ? -1 : 1);
    if (sort === 'price-asc') rows.sort(byPrice);
    else if (sort === 'price-desc') rows.sort((a, b) => -byPrice(a, b));
    else if (sort === 'context') rows.sort((a, b) => b.contextTokens - a.contextTokens || a.order - b.order);
    else rows.sort((a, b) => Number(b.mine) - Number(a.mine) || a.order - b.order);
    return rows;
  }, [models, query, vendor, mode, tag, sort]);

  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(id); setCopied(id); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ }
  };
  const filtered = vendor !== 'all' || mode !== 'all' || Boolean(tag) || Boolean(query.trim());
  const reset = () => { setVendor('all'); setMode('all'); setTag(''); setQuery(''); };

  const badges = (item: SquareModel) => (
    <>
      {item.mine && <span className="ms-badge ms-badge--mine">我的默认</span>}
      {!hasMine && item.siteDefault && <span className="ms-badge">站点默认</span>}
      {item.featured && <span className="ms-badge ms-badge--hot">推荐</span>}
    </>
  );
  const copyBtn = (item: SquareModel) => (
    <button className="ms-copy" type="button" onClick={(event) => { event.stopPropagation(); void copy(item.id); }} aria-label={`复制模型名 ${item.id}`}>
      <code>{item.id}</code>
      <span>{copied === item.id ? '已复制' : '复制'}</span>
    </button>
  );
  const action = (item: SquareModel) => (signedIn ? <ModelDefaultButton model={item.id} active={item.mine} /> : <Link className="p-btn p-btn--sm" href="/login?mode=login">登录后选择</Link>);

  if (!models.length) {
    return (
      <>
        <header className="ms-hero"><h1>模型广场</h1><p>站内能用的模型都在这里。</p></header>
        <div className="p-empty"><div className="p-empty-title">还没有上架的模型</div><p className="p-empty-text">管理员在后台接入渠道后，这里会列出可用的模型。</p></div>
      </>
    );
  }

  return (
    <>
      <header className="ms-hero">
        <div>
          <h1>模型广场</h1>
          <p>每个模型的文风、速度和价格都不一样。设为默认后，新开的对话会用它；对话里也能随时切换。</p>
        </div>
        <dl className="ms-stats">
          <div><dt>可用模型</dt><dd>{models.length}</dd></div>
          <div><dt>厂商</dt><dd>{vendors.length}</dd></div>
          {cheapest !== null && <div><dt>最低</dt><dd>{fmt(cheapest)}<small> 点/千</small></dd></div>}
        </dl>
      </header>

      <div className="ms-layout">
        <aside className="ms-filters" aria-label="筛选">
          <div className="ms-fgroup">
            <span className="ms-flabel">厂商</span>
            <div className="ms-fopts">
              <button type="button" className={vendor === 'all' ? 'is-on' : undefined} aria-pressed={vendor === 'all'} onClick={() => setVendor('all')}><span className="ms-mark ms-mark--all" aria-hidden="true">全</span>全部<em>{models.length}</em></button>
              {vendors.map(({ vendor: item, count }) => (
                <button key={item.key} type="button" className={vendor === item.key ? 'is-on' : undefined} aria-pressed={vendor === item.key} onClick={() => setVendor(item.key)}><VendorMark vendor={item} size={22} />{item.name}<em>{count}</em></button>
              ))}
            </div>
          </div>
          {hasCall && hasToken && (
            <div className="ms-fgroup">
              <span className="ms-flabel">计费方式</span>
              <div className="ms-fopts">
                {([['all', '全部'], ['token', '按量（tokens）'], ['call', '按次']] as const).map(([value, label]) => (
                  <button key={value} type="button" className={mode === value ? 'is-on' : undefined} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>
                ))}
              </div>
            </div>
          )}
          {tags.length > 0 && (
            <div className="ms-fgroup">
              <span className="ms-flabel">标签</span>
              <div className="ms-fopts ms-fopts--chips">
                {tags.map((value) => (
                  <button key={value} type="button" className={tag === value ? 'is-on' : undefined} aria-pressed={tag === value} onClick={() => setTag(tag === value ? '' : value)}>{value}</button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="ms-main" aria-label="模型列表">
          <div className="ms-toolbar">
            <label className="ms-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" /></svg>
              <input className="p-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型名、厂商或标签" aria-label="搜索模型" />
            </label>
            <Select className="ms-sort" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="排序">
              <option value="recommend">推荐排序</option>
              <option value="price-asc">价格从低到高</option>
              <option value="price-desc">价格从高到低</option>
              <option value="context">上下文最长</option>
            </Select>
            <div className="ms-view" role="group" aria-label="显示方式">
              <button type="button" aria-pressed={view === 'card'} onClick={() => pickView('card')} aria-label="卡片"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg></button>
              <button type="button" aria-pressed={view === 'list'} onClick={() => pickView('list')} aria-label="列表"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg></button>
            </div>
          </div>
          <p className="ms-count" aria-live="polite">共 {list.length} 个模型{filtered && <> · <button type="button" className="p-text-btn" onClick={reset}>清除筛选</button></>}</p>

          {!list.length ? (
            <div className="p-empty"><div className="p-empty-title">没有符合条件的模型</div><p className="p-empty-text">换个关键词，或清除筛选再看看。</p></div>
          ) : view === 'card' ? (
            <div className="ms-grid">
              {list.map((item) => (
                <article key={item.id} className={`ms-card${item.mine ? ' is-mine' : ''}${item.featured ? ' is-featured' : ''}`}>
                  <button className="ms-card-hit" type="button" onClick={() => setOpen(item)} aria-label={`查看 ${item.name} 详情`} />
                  <div className="ms-card-head">
                    <VendorMark vendor={item.vendor} />
                    <div className="ms-card-title"><h2>{item.name}</h2><span>{item.vendor.name}</span></div>
                    <div className="ms-badges">{badges(item)}</div>
                  </div>
                  {copyBtn(item)}
                  <p className={`ms-summary${item.summary ? '' : ' is-auto'}`}>{item.summary || autoSummary(item)}</p>
                  <div className="ms-tags">
                    {item.context && <span className="ms-tag ms-tag--ctx" title={item.contextDefault ? '管理员未标注，按站点默认窗口' : undefined}>上下文 {item.context}{item.contextDefault && <em className="ms-ctx-def">默认</em>}</span>}
                    {[...item.traits, ...item.tags].slice(0, 4).map((value) => <span key={value} className="ms-tag">{value}</span>)}
                  </div>
                  <div className="ms-card-foot">
                    <div>
                      <PriceBlock item={item} />
                      <span className="ms-est">≈ 每条 {perReply(item)}{item.tiers.length ? ' · 长上下文另计' : ''}</span>
                    </div>
                    <div className="ms-card-act">{action(item)}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="ms-table-wrap">
              <table className="ms-table">
                <thead><tr><th>模型</th><th>厂商</th><th>计费</th><th>价格</th><th>上下文</th><th>每条约</th><th><span className="sr-only">操作</span></th></tr></thead>
                <tbody>
                  {list.map((item) => (
                    <tr key={item.id} className={item.mine ? 'is-mine' : undefined}>
                      <td><button type="button" className="ms-row-name" onClick={() => setOpen(item)}><b>{item.name}</b><code>{item.id}</code></button><div className="ms-badges">{badges(item)}</div></td>
                      <td><span className="ms-row-vendor"><VendorMark vendor={item.vendor} size={22} />{item.vendor.name}</span></td>
                      <td>{item.mode === 'call' ? '按次' : '按量'}</td>
                      <td className="ms-num"><b>{fmt(item.price)}</b> {item.mode === 'call' ? '点/次' : '点/千'}{item.tiers.length ? <small> 分档</small> : null}</td>
                      <td className="ms-num">{item.context || '—'}</td>
                      <td className="ms-num">{perReply(item)}</td>
                      <td>{action(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="p-small ms-note">按量计费的模型，一次回复大约 1–3 千 tokens（设定越长、聊得越久，每条越多）。余额和明细在「我的 › 点数与充值」。</p>
        </section>
      </div>

      {open && <ModelDrawer item={open} onClose={() => setOpen(null)} action={action(open)} copyBtn={copyBtn(open)} badges={badges(open)} />}
    </>
  );
}

function ModelDrawer({ item, onClose, action, copyBtn, badges }: { item: SquareModel; onClose: () => void; action: React.ReactNode; copyBtn: React.ReactNode; badges: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('.ms-drawer-close')?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);
  const unit = item.mode === 'call' ? '点 / 次' : '点 / 千 tokens';
  return (
    <div className="ms-drawer-wrap" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ms-drawer" role="dialog" aria-modal="true" aria-labelledby="ms-drawer-title" ref={panelRef}>
        <button className="ms-drawer-close" type="button" onClick={onClose} aria-label="关闭">×</button>
        <div className="ms-card-head">
          <VendorMark vendor={item.vendor} size={48} />
          <div className="ms-card-title"><h2 id="ms-drawer-title">{item.name}</h2><span>{item.vendor.name}</span></div>
        </div>
        <div className="ms-badges">{badges}</div>
        {copyBtn}
        <p className={`ms-summary${item.summary ? '' : ' is-auto'}`}>{item.summary || autoSummary(item)}</p>
        <div className="ms-drawer-price"><PriceBlock item={item} big /><span className="ms-est">≈ 每条回复 {perReply(item)}</span></div>
        <dl className="ms-specs">
          <div><dt>计费方式</dt><dd>{item.mode === 'call' ? '按次：每次生成固定扣点' : '按量：按用掉的 tokens 扣点，不足 1 点按 1 点'}</dd></div>
          <div><dt>基础价格</dt><dd>{fmt(item.price)} {unit}{item.mode === 'token' ? `（每百万 tokens ${fmt(item.price * 1000)} 点）` : ''}</dd></div>
          {item.tiers.map((tier) => (
            <div key={tier.above}><dt>长上下文</dt><dd>输入超过 {kTokens(tier.above)} tokens 时 {fmt(tier.price)} {unit}</dd></div>
          ))}
          <div><dt>上下文</dt><dd>{item.contextDefault ? `${item.context} tokens（未标注，按站点默认窗口）` : `${item.context} tokens`}</dd></div>
          {(item.traits.length > 0 || item.tags.length > 0) && <div><dt>特点</dt><dd className="ms-tags">{[...item.traits, ...item.tags].map((value) => <span key={value} className="ms-tag">{value}</span>)}</dd></div>}
        </dl>
        <div className="ms-drawer-act">{action}<Link className="p-btn p-btn--sm" href="/">去找角色开聊</Link></div>
      </div>
    </div>
  );
}
