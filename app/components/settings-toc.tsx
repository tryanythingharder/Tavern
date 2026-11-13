'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const GROUPS = [
  {
    label: '账号',
    items: [
      { href: '/me', label: '账号' },
      { href: '/me/security', label: '安全与隐私' },
    ],
  },
  {
    label: '资产',
    items: [
      { href: '/me/points', label: '点数与充值' },
    ],
  },
  {
    label: '聊天',
    items: [
      { href: '/me/appearance', label: '聊天外观' },
      { href: '/me/personas', label: '我的身份' },
      { href: '/me/quick-replies', label: '快捷回复' },
    ],
  },
  {
    label: '资源',
    items: [
      { href: '/me/presets', label: '预设' },
      { href: '/me/lorebooks', label: '世界书' },
      { href: '/me/regex', label: '正则' },
      { href: '/me/cards', label: '角色卡' },
    ],
  },
  {
    label: '数据',
    items: [
      { href: '/me/library', label: '角色库' },
      { href: '/me/import', label: '导入与数据' },
    ],
  },
];

// 设置分区导航：桌面纵向分组，手机横向胶囊（组间用细线分隔）
export function SettingsToc() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = navRef.current?.querySelector('a.is-active');
    // 只在当前项不在可视区时滚动，避免一进页面就把左侧胶囊切掉一半
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  return (
    <nav className="p-toc" aria-label="设置目录" ref={navRef}>
      {GROUPS.map((group) => (
        <div className="p-toc-group" role="group" aria-label={group.label} key={group.label}>
          <span className="p-toc-label">{group.label}</span>
          {group.items.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={pathname === section.href ? 'is-active' : undefined}
              aria-current={pathname === section.href ? 'page' : undefined}
            >
              {section.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
