'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Select } from '@/components/ui-select';

// 后台统一列表骨架：搜索 + 状态 Tab + 下拉筛选 + 表头排序 + 分页。
// 所有状态都写进 URL 查询参数（?q=&status=&sort=&dir=&page=&per=），刷新、前进后退、复制链接都能还原。
// 列表数据在服务端按这些参数查询（lib/admin-query.ts）。

type Option = { value: string; label: string; count?: number };

export function useListHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!keepPage && !('page' in changes)) next.delete('page');
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
}

export function AdminListBar({
  placeholder,
  tabs,
  selects = [],
  total,
  unit,
  children,
}: {
  placeholder: string;
  tabs?: { key: string; label: string; options: Option[]; fallback?: string };
  selects?: { key: string; label: string; options: Option[] }[];
  total: number;
  unit: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const href = useListHref();
  const [pending, startTransition] = useTransition();
  const urlQ = params.get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const last = useRef(urlQ);

  // URL 被外部改动（后退/点 Tab）时同步输入框
  useEffect(() => { if (urlQ !== last.current) { last.current = urlQ; setQ(urlQ); } }, [urlQ]);

  // 输入停 350ms 后写 URL（replace，不污染历史）
  useEffect(() => {
    if (q.trim() === last.current) return;
    const timer = setTimeout(() => {
      last.current = q.trim();
      startTransition(() => router.replace(href({ q: q.trim() || null }), { scroll: false }));
    }, 350);
    return () => clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // 「/」聚焦搜索框
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const activeTab = tabs ? params.get(tabs.key) ?? tabs.fallback ?? '' : '';
  const filtered = Boolean(urlQ) || selects.some((item) => params.get(item.key));

  return (
    <div className="admin-toolbar a-listbar" aria-busy={pending || undefined}>
      {tabs && (
        <nav className="p-tabs a-listtabs" aria-label={tabs.label}>
          {tabs.options.map((option) => (
            <Link
              key={option.value || 'all'}
              href={href({ [tabs.key]: option.value === (tabs.fallback ?? '') ? null : option.value || 'all' })}
              aria-current={activeTab === option.value || (activeTab === 'all' && !option.value) ? 'page' : undefined}
              aria-selected={activeTab === option.value || (activeTab === 'all' && !option.value)}
              scroll={false}
            >
              {option.label}
              {typeof option.count === 'number' && <span className="a-count">{option.count}</span>}
            </Link>
          ))}
        </nav>
      )}
      <label className="p-search">
        <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
        <input
          ref={inputRef}
          className="p-input"
          type="search"
          value={q}
          placeholder={`${placeholder}（按 / 聚焦）`}
          aria-label={placeholder}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { last.current = q.trim(); startTransition(() => router.replace(href({ q: q.trim() || null }), { scroll: false })); }
            if (event.key === 'Escape' && q) { event.preventDefault(); setQ(''); }
          }}
        />
      </label>
      {selects.map((item) => (
        <Select
          key={item.key}
          className="p-select"
          aria-label={item.label}
          value={params.get(item.key) ?? ''}
          onChange={(event) => startTransition(() => router.push(href({ [item.key]: event.target.value || null }), { scroll: false }))}
        >
          {item.options.map((option) => <option key={option.value} value={option.value}>{option.label}{typeof option.count === 'number' ? ` (${option.count})` : ''}</option>)}
        </Select>
      ))}
      <span className="p-small a-listcount" role="status">
        {pending ? '加载中…' : `${total.toLocaleString('zh-CN')} ${unit}`}
        {filtered && !pending && <> · <Link href={href(Object.fromEntries([['q', null], ...selects.map((item) => [item.key, null])]))} scroll={false}>清除筛选</Link></>}
      </span>
      {children && <div className="a-listextra">{children}</div>}
    </div>
  );
}

export function SortTh({ k, label, first = 'desc', current, className }: { k: string; label: string; first?: 'asc' | 'desc'; current: { sort: string; dir: 'asc' | 'desc' }; className?: string }) {
  const href = useListHref();
  const active = current.sort === k;
  const nextDir = active ? (current.dir === 'asc' ? 'desc' : 'asc') : first;
  return (
    <th className={className} aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link className={`a-sort${active ? ' is-active' : ''}`} href={href({ sort: k, dir: nextDir })} scroll={false}>
        {label}
        <span aria-hidden="true" className="a-sort-ind">{active ? (current.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </Link>
    </th>
  );
}

export function AdminPager({ page, pages, total, per, unit }: { page: number; pages: number; total: number; per: number; unit: string }) {
  const href = useListHref();
  const router = useRouter();
  const from = total ? (page - 1) * per + 1 : 0;
  const to = Math.min(total, page * per);
  const nums: (number | '…')[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="p-table-foot a-pager" aria-label="分页">
      <span className="p-foot-count">{from}–{to} / 共 {total.toLocaleString('zh-CN')} {unit}</span>
      <div className="p-foot-right">
        <Select className="p-select a-per" aria-label="每页条数" value={String(per)} onChange={(event) => router.push(href({ per: event.target.value === '20' ? null : event.target.value }), { scroll: false })}>
          <option value="20">20 条/页</option>
          <option value="50">50 条/页</option>
          <option value="100">100 条/页</option>
        </Select>
        {pages > 1 && (
          <>
            {page > 1 ? <Link className="p-btn p-btn--sm" href={href({ page: String(page - 1) }, true)} rel="prev">上一页</Link> : <span className="p-btn p-btn--sm" aria-disabled="true">上一页</span>}
            {nums.map((n, index) => (n === '…'
              ? <span key={`gap-${index}`} className="a-page-gap" aria-hidden="true">…</span>
              : <Link key={n} className={`p-btn p-btn--sm a-page${n === page ? ' is-current' : ''}`} href={href({ page: n === 1 ? null : String(n) }, true)} aria-current={n === page ? 'page' : undefined} aria-label={`第 ${n} 页`}>{n}</Link>))}
            {page < pages ? <Link className="p-btn p-btn--sm" href={href({ page: String(page + 1) }, true)} rel="next">下一页</Link> : <span className="p-btn p-btn--sm" aria-disabled="true">下一页</span>}
          </>
        )}
      </div>
    </nav>
  );
}

/** 空状态：区分「真的没有」和「筛选后没有」 */
export function AdminEmpty({ colSpan, filtered, children }: { colSpan: number; filtered: boolean; children: ReactNode }) {
  const href = useListHref();
  return (
    <tr>
      <td colSpan={colSpan} className="admin-empty">
        {filtered ? <>没有符合条件的结果。<Link href={href({ q: null, status: null, role: null, type: null, nsfw: null })}>清除筛选</Link></> : children}
      </td>
    </tr>
  );
}
