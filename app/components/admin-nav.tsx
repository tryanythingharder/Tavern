'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ADMIN_GROUPS, activeGroup, isActiveHref } from '@/lib/admin-nav';

const STORE = 'yehua-admin-nav-open';

const svg = (path: string) => (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={path} /></svg>
);

// 桌面侧栏：分类可折叠，当前页所在分类自动展开；展开状态记在本地
export function AdminSideNav({ pathname }: { pathname: string }) {
  const current = activeGroup(pathname).id;
  const [open, setOpen] = useState<string[]>([current]);

  useEffect(() => {
    let saved: string[] = [];
    try { saved = JSON.parse(localStorage.getItem(STORE) || '[]'); } catch { saved = []; }
    setOpen((prev) => Array.from(new Set([...saved, ...prev, current])));
  }, [current]);

  const toggle = (id: string) => {
    setOpen((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* 隐私模式 */ }
      return next;
    });
  };

  return (
    <nav className="p-anav" aria-label="后台导航">
      {ADMIN_GROUPS.map((group) => {
        if (group.items.length === 1) {
          const item = group.items[0];
          const active = isActiveHref(pathname, item.href);
          return (
            <Link key={group.id} className="p-nav-item p-anav-solo" href={item.href} aria-current={active ? 'page' : undefined}>
              {svg(group.icon)}
              <span>{group.id === 'home' ? group.label : item.label}</span>
            </Link>
          );
        }
        const expanded = open.includes(group.id);
        const hasActive = group.id === current;
        return (
          <div key={group.id} className={`p-anav-group${hasActive ? ' has-active' : ''}`}>
            <button type="button" className="p-nav-item p-anav-head" aria-expanded={expanded} aria-controls={`anav-${group.id}`} onClick={() => toggle(group.id)}>
              {svg(group.icon)}
              <span>{group.label}</span>
              <svg className="p-anav-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </button>
            <div id={`anav-${group.id}`} className="p-anav-sub" hidden={!expanded}>
              {group.items.map((item) => (
                <Link key={item.href} className="p-nav-item p-anav-leaf" href={item.href} aria-current={isActiveHref(pathname, item.href) ? 'page' : undefined}>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// 手机：上一行是分类，下一行是当前分类的子菜单
export function AdminMobileNav({ pathname }: { pathname: string }) {
  const current = activeGroup(pathname);
  const ref = useRef<HTMLDivElement | null>(null);
  // 分类条横向滚动：把当前分类/子页滚到可见处（390 宽下后几类原本被截断）
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLElement>('[aria-current="page"]').forEach((el) => {
      const bar = el.parentElement;
      if (bar && (el.offsetLeft < bar.scrollLeft || el.offsetLeft + el.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
        bar.scrollLeft = el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2;
      }
    });
  }, [pathname]);
  return (
    <div className="p-amobnav" ref={ref}>
      <nav className="p-atabs" aria-label="后台分类">
        {ADMIN_GROUPS.map((group) => (
          <Link key={group.id} href={group.items[0].href} aria-current={group.id === current.id ? 'page' : undefined}>
            {group.label}
          </Link>
        ))}
        <Link className="p-atabs-back" href="/">返回前台</Link>
      </nav>
      {current.items.length > 1 && (
        <nav className="p-asubtabs" aria-label={`${current.label}子菜单`}>
          {current.items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActiveHref(pathname, item.href) ? 'page' : undefined}>{item.label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}
