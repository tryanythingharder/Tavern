import Link from 'next/link';
import type { ReactNode } from 'react';
import { navItem } from '@/lib/admin-nav';

// 后台页头：面包屑（后台 › 分类 › 页面 [› 详情]）+ 标题 + 副标题 + 右侧操作。
// 面包屑从 lib/admin-nav.ts 读，与侧栏同源。
export function AdminHeader({ href, title, sub, trail = [], actions }: {
  href: string;
  title?: string;
  sub?: ReactNode;
  trail?: string[];
  actions?: ReactNode;
}) {
  const found = navItem(href);
  const isHome = href === '/admin';
  return (
    <header className="p-atoolbar">
      <div style={{ minWidth: 0 }}>
        <nav className="p-acrumb" aria-label="面包屑">
          <Link href="/admin">后台</Link>
          {!isHome && found && (
            <>
              <span aria-hidden="true">›</span>
              <span>{found.group.label}</span>
              <span aria-hidden="true">›</span>
              {trail.length ? <Link href={href}>{found.item.label}</Link> : <span aria-current="page">{found.item.label}</span>}
            </>
          )}
          {trail.map((item, index) => (
            <span key={item} style={{ display: 'contents' }}>
              <span aria-hidden="true">›</span>
              <span aria-current={index === trail.length - 1 ? 'page' : undefined}>{item}</span>
            </span>
          ))}
        </nav>
        <h1>{title ?? found?.item.label ?? ''}</h1>
        {(sub ?? found?.item.desc) && <div className="p-atoolbar-sub">{sub ?? found?.item.desc}</div>}
      </div>
      {actions && <div className="p-atoolbar-actions">{actions}</div>}
    </header>
  );
}
