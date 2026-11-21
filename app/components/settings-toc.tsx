'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePlayMode } from '@/components/play-mode';

type TocItem = { href: string; label: string; st?: string; advanced?: boolean };
// advanced：新手模式默认收起（功能仍在，点「显示进阶设置」或直接访问都能用）
const GROUPS: { label: string; advanced?: boolean; items: TocItem[] }[] = [
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
      { href: '/me/invite', label: '邀请返点' },
      { href: '/models', label: '模型广场' },
    ],
  },
  {
    label: '聊天',
    items: [
      { href: '/me/appearance', label: '外观' },
      { href: '/me/personas', label: '我的身份', st: 'Persona' },
      { href: '/me/quick-replies', label: '快捷回复', st: 'Quick Reply' },
    ],
  },
  {
    label: '资源',
    advanced: true,
    items: [
      { href: '/me/presets', label: '预设', st: 'Preset' },
      { href: '/me/lorebooks', label: '世界书', st: 'World Info' },
      { href: '/me/regex', label: '正则', st: 'Regex' },
      { href: '/me/cards', label: '角色卡', st: 'Card 覆盖' },
    ],
  },
  {
    label: '数据',
    items: [
      { href: '/me/library', label: '角色库' },
      { href: '/me/import', label: '导入与数据', st: 'ST 导入', advanced: true },
    ],
  },
];

// 设置分区导航：桌面纵向分组，手机横向胶囊（组间用细线分隔）
export function SettingsToc() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement | null>(null);
  const mode = usePlayMode();
  const newbie = mode === 'newbie';
  const onAdvanced = GROUPS.some((group) => group.items.some((item) => item.href === pathname && (group.advanced || item.advanced)));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const reveal = !newbie || showAdvanced || onAdvanced;

  useEffect(() => {
    const active = navRef.current?.querySelector('a.is-active');
    // 只在当前项不在可视区时滚动，避免一进页面就把左侧胶囊切掉一半
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  return (
    <nav className="p-toc" aria-label="设置目录" ref={navRef}>
      {GROUPS.filter((group) => reveal || !group.advanced).map((group) => (
        <div className="p-toc-group" role="group" aria-label={group.label} key={group.label}>
          <span className="p-toc-label">{group.label}{group.advanced && newbie ? <small className="pm-st">进阶</small> : null}</span>
          {group.items.filter((item) => reveal || !item.advanced).map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={pathname === section.href ? 'is-active' : undefined}
              aria-current={pathname === section.href ? 'page' : undefined}
            >
              {section.label}
              {!newbie && section.st ? <small className="pm-st">{section.st}</small> : null}
            </Link>
          ))}
        </div>
      ))}
      {newbie && !onAdvanced && (
        <button type="button" className="pm-toc-more" onClick={() => setShowAdvanced((value) => !value)} aria-expanded={showAdvanced}>
          {showAdvanced ? '收起进阶设置' : '显示进阶设置（预设、世界书、正则…）'}
        </button>
      )}
    </nav>
  );
}
