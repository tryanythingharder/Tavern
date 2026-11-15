'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CharacterCover } from '@/components/character-cover';
import { AppearanceButton, AppearanceDrawer } from '@/components/appearance-drawer';
import type { AppearancePrefs } from '@/lib/appearance';
import type { Theme } from '@/lib/theme';
import { AnnouncementBar } from '@/components/announcement-bar';
import { CheckinPopup } from '@/components/checkin-popup';
import { MotionLayer } from '@/components/motion-layer';
import { CommandPalette } from '@/components/command-palette';
import { OfflineBanner } from '@/components/offline-banner';

// 图标：与原型一致的内联 SVG（class="p-icon"）
const icon = (path: string) => (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
);

const NAV = [
  { href: '/', label: '发现', path: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z', page: 'home' },
  { href: '/plaza', label: '广场', path: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.2-11.2-2 4.4-4.4 2 2-4.4z', page: 'plaza' },
  { href: '/chats', label: '对话', path: 'M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z', page: 'chats' },
  { href: '/create', label: '创作', path: 'M12 5v14M5 12h14', page: 'create' },
  { href: '/me', label: '我的', path: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0', page: 'settings' },
];

type Recent = { id: number; characterId: string; name: string; initial: string; hue: number; owner: number | null; title: string };

const ADMIN_SECTIONS = [
  { href: '/admin', label: '审核队列' },
  { href: '/admin/users', label: '玩家' },
  { href: '/admin/orders', label: '订单与兑换码' },
  { href: '/admin/settings', label: '接口配置' },
];

const ADMIN_NAV: { label: string; items: { href: string; label: string; path: string }[] }[] = [
  {
    label: '内容',
    items: [
      { href: '/admin', label: '概览', path: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z' },
      { href: '/admin/review', label: '广场审核', path: 'M4 5h16v14H4zM8 9h8M8 13h5' },
      { href: '/admin/reports', label: '举报处理', path: 'M12 3 2 21h20zM12 9v5M12 17v.01' },
      { href: '/admin/announcement', label: '公告', path: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Zm12-5 4-2v16l-4-2' },
    ],
  },
  {
    label: '用户与交易',
    items: [
      { href: '/admin/users', label: '玩家', path: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0' },
      { href: '/admin/orders', label: '订单', path: 'M3 6h18v12H3zM3 10h18M7 15h4' },
      { href: '/admin/codes', label: '卡密', path: 'M4 7h16v10H4zM8 7V5h8v2M9 12h6' },
      { href: '/admin/invites', label: '邀请码', path: 'M12 3v18M5 8h14M5 16h14' },
    ],
  },
  {
    label: '配置',
    items: [
      { href: '/admin/channels', label: '渠道', path: 'M4 6h16v4H4zM4 14h16v4H4z' },
      { href: '/admin/model', label: '单线路配置', path: 'M4 7h16v10H4zM8 12h8' },
      { href: '/admin/settings', label: '接口配置', path: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3 2-1-2-4-2 .5-1.5-1L15 4h-6l-.5 2.5-1.5 1L5 7l-2 4 2 1-2 1 2 4 2-.5 1.5 1L9 20h6l.5-2.5 1.5-1 2 .5 2-4z' },
    ],
  },
  {
    label: '系统',
    items: [
      { href: '/admin/audit', label: '审计日志', path: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h4' },
    ],
  },
];

export function SiteShell({
  children,
  userName,
  points = 0,
  unread = 0,
  admin = false,
  recents = [],
  costs = { text: 2, image: 20, tts: 5 },
  view = 'classic',
  theme = 'folio',
  announcement = '',
  checkin = null,
  appearance,
}: {
  children: ReactNode;
  userName?: string;
  points?: number;
  unread?: number;
  admin?: boolean;
  recents?: Recent[];
  costs?: { text: number; image: number; tts: number };
  view?: 'classic' | 'cinema';
  theme?: Theme;
  appearance?: AppearancePrefs;
  announcement?: string;
  checkin?: { todayDone: boolean; streak: number; amount: number; day: string } | null;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname.startsWith('/c/');
    if (href === '/plaza') return pathname === '/plaza' || pathname.startsWith('/a/');
    if (href === '/chats') return pathname.startsWith('/chats') || pathname.startsWith('/rooms');
    if (href === '/me') return pathname.startsWith('/me') || pathname.startsWith('/library');
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const adminPage = pathname.startsWith('/admin');
  const showCheckin = Boolean(userName && checkin && (pathname === '/' || pathname === '/plaza' || pathname.startsWith('/c/') || pathname.startsWith('/a/')));
  const page = (() => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/c/')) return 'character';
    if (pathname.startsWith('/chats/')) return 'chat';
    if (pathname.startsWith('/chats')) return 'chats';
    if (pathname.startsWith('/a/')) return 'author';
    if (pathname.startsWith('/rooms/')) return 'chat';
    if (pathname.startsWith('/rooms')) return 'rooms';
    if (pathname.startsWith('/create')) return 'create';
    if (pathname.startsWith('/library')) return 'library';
    if (pathname.startsWith('/notifications')) return 'notifications';
    if (pathname.startsWith('/me')) return 'settings';
    if (pathname.startsWith('/admin')) return 'admin';
    return pathname.split('/')[1] || 'home';
  })();
  // 原型的影院模式只作用于叙事页：home / plaza / character / author
  const narrative = ['home', 'plaza', 'character', 'author'].includes(page);
  const [pointsOpen, setPointsOpen] = useState(false);
  const pointsRef = useRef<HTMLDivElement | null>(null);
  const pointsTriggerRef = useRef<HTMLButtonElement | null>(null);

  // 原型的经典样式按 body[data-page] 生效；影院样式还依赖 body.p-cinema
  // 用 layout effect：在浏览器绘制前同步，切页时不会先闪一下旧排版
  useLayoutEffect(() => {
    const cinema = view === 'cinema' && narrative;
    document.body.dataset.page = page;
    document.body.dataset.view = cinema ? 'cinema' : 'classic';
    document.body.classList.toggle('p-cinema', cinema);
    return () => {
      delete document.body.dataset.page;
      delete document.body.dataset.view;
      document.body.classList.remove('p-cinema');
    };
  }, [page, view, narrative]);

  // 后台手机顶部分类条 / 桌面侧栏：当前项滚进可视区
  useEffect(() => {
    if (!adminPage) return;
    const active = document.querySelector('.p-atabs a[aria-current="page"]');
    active?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    // 桌面侧栏是独立滚动容器：只调 scrollTop，避免整页跟着滚
    const nav = document.querySelector<HTMLElement>('.p-anav');
    const navActive = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (nav && navActive) {
      const navRect = nav.getBoundingClientRect();
      const itemRect = navActive.getBoundingClientRect();
      const margin = 8;
      if (itemRect.bottom > navRect.bottom - margin) nav.scrollTop += itemRect.bottom - navRect.bottom + margin;
      else if (itemRect.top < navRect.top + margin) nav.scrollTop -= navRect.top - itemRect.top + margin;
    }
  }, [pathname, adminPage]);

  useEffect(() => {
    if (!pointsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!pointsRef.current?.contains(event.target as Node)) setPointsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPointsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pointsOpen]);

  useEffect(() => {
    if (!pointsOpen) return;
    const first = pointsRef.current?.querySelector<HTMLElement>('.p-points-panel a, .p-points-panel button');
    first?.focus();
    return () => pointsTriggerRef.current?.focus();
  }, [pointsOpen]);

  const pointsMenu = userName ? (
    <div className="p-points" ref={pointsRef}>
      <button ref={pointsTriggerRef} className="p-points-trigger" type="button" aria-expanded={pointsOpen} aria-haspopup="dialog" aria-controls="points-panel" onClick={() => setPointsOpen((value) => !value)}>
        {icon('M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3')}
        <span>{points}</span>
        <small>点</small>
      </button>
      {pointsOpen && (
        <div className="p-points-panel" id="points-panel" role="dialog" aria-label="点数与消耗">
          <div className="p-points-head"><span>余额</span><strong>{points}</strong></div>
          <p className="p-points-sub">每 1000 tokens 扣 {costs.text} 点</p>
          <ul className="p-points-list">
            <li><span>文本</span><b>{costs.text} 点 / 千 tokens</b></li>
            <li><span>生图</span><b>{costs.image} 点 / 张</b></li>
            <li><span>语音</span><b>{costs.tts} 点 / 条</b></li>
          </ul>
          <div className="p-points-actions">
            <Link className="p-btn p-btn--primary p-btn--sm" href="/me/points">充值</Link>
            <Link className="p-btn p-btn--sm" href="/me/points">点数记录</Link>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const overlays = (
    <>
      <MotionLayer />
      <OfflineBanner />
      <AppearanceDrawer theme={theme} initial={appearance} />
      {userName && <CommandPalette recents={recents.map((recent) => ({ id: recent.id, name: recent.name, title: recent.title }))} />}
    </>
  );

  if (pathname.startsWith('/login') || pathname === '/forgot' || pathname === '/reset' || pathname.startsWith('/verify') || pathname === '/terms' || pathname === '/privacy' || pathname === '/guidelines' || pathname === '/support') return <>{children}<MotionLayer /></>;

  // 后台：原型 admin.html 的独立骨架（240px 侧栏 + 主区工具栏）
  if (adminPage) {
    if (!admin) return <>{children}</>;
    return (
      <div className="p-admin">
        <aside className="p-aside">
          <Link className="p-abrand" href="/admin">
            <div className="p-mark">酒</div>
            <div className="p-brand-name">酒馆</div>
          </Link>
          <div className="p-abrand-tag"><span className="p-pill p-pill--sm p-pill--outline">管理后台</span></div>
          <nav className="p-anav" aria-label="后台导航">
            {ADMIN_NAV.map((group) => (
              <div key={group.label}>
                <div className="p-nav-label">{group.label}</div>
                {group.items.map((item) => {
                  const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} className="p-nav-item" href={item.href} aria-current={active ? 'page' : undefined}>
                      {icon(item.path)}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="p-side-foot">
            <Link className="p-user-row" href="/me">
              <span className="p-avatar" style={{ ['--size' as string]: '32px', ['--h' as string]: 28 }}>{userName ? Array.from(userName)[0] : 'A'}</span>
              <span><span className="p-user-name">{userName ?? '管理员'}</span><br /><span className="p-user-sub">超级管理员</span></span>
            </Link>
            <Link className="p-btn p-btn--sm p-btn--block" href="/">返回前台</Link>
          </div>
        </aside>
        <div className="p-amain">
          <nav className="p-atabs" aria-label="后台分区">
            {ADMIN_NAV.flatMap((group) => group.items).map((item) => {
              const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>
                  {item.label}
                </Link>
              );
            })}
            <Link className="p-atabs-back" href="/">返回前台</Link>
          </nav>
          {children}
        </div>
        {overlays}
      </div>
    );
  }

  // 影院模式：叙事页用顶部幕布导航（对齐原型 cinemaNav），设置/后台仍用侧栏
  if (view === 'cinema' && narrative) {
    return (
      <div className="cinema-shell">
        <header className="cinema-nav">
          <nav className="cinema-nav-left" aria-label="主导航">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>{item.label}</Link>
            ))}
          </nav>
          <Link className="cinema-logo" href="/">酒馆</Link>
          <div className="cinema-nav-right">
            <AppearanceButton />
            {userName && (
              <Link className="pill" href="/notifications" aria-label={unread ? `通知，${unread} 条未读` : '通知'}>
                {icon('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4')}
                <span className="pill-label">通知</span>
                {unread > 0 && <span className="p-unread-badge">{unread > 9 ? '9+' : unread}</span>}
              </Link>
            )}
            {pointsMenu}
            <Link className="cinema-account" href={userName ? '/me' : '/login'} aria-label={userName ? '我的账号' : '登录'} prefetch={false}>
              {userName ? Array.from(userName)[0] : '林'}
            </Link>
          </div>
        </header>
        <main className="cinema-main" id="main-content" tabIndex={-1}>{children}</main>
        <nav className="p-tabbar" aria-label="主导航">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
              {icon(item.path)}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        {showCheckin && checkin && <CheckinPopup initial={checkin} />}
        {overlays}
      </div>
    );
  }


  return (
    <div className="p-shell">
      <aside className="p-side">
        <Link className="p-brand" href="/">
          <div className="p-mark">酒</div>
          <div className="p-brand-name">酒馆</div>
        </Link>

        <>
          <nav className="p-nav" aria-label="主导航">
              {NAV.map((item) => (
                <Link key={item.href} className="p-nav-item" href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
                  {icon(item.path)}
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            {userName && (
              <>
                <div className="p-nav-label">继续故事</div>
                <nav className="p-nav p-side-recents" aria-label="最近会话">
                  {recents.map((recent) => (
                    <Link key={recent.id} className="p-side-recent" href={`/chats/${recent.id}`}>
                      <CharacterCover
                        character={{ id: recent.characterId, name: recent.name, initial: recent.initial, hue: recent.hue, ownerId: recent.owner }}
                        width={26}
                        height={26}
                        rounded={8}
                      />
                      <span>{recent.name}<small>{recent.title}</small></span>
                    </Link>
                  ))}
                  {!recents.length && <span className="p-side-recent" style={{ opacity: 0.6 }}><span>还没有故事</span></span>}
                </nav>
                <Link className="p-side-recent" href="/rooms">{icon('M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M15 20a6 6 0 0 1 6-6')}<span>多角色房间</span></Link>
                <Link className="p-side-recent" href="/library">{icon('M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 8h6M9 12h6')}<span>我的角色库</span></Link>
                {admin && <Link className="p-side-recent" href="/admin">{icon('M12 3 4 7v6c0 4 3.4 7.4 8 8 4.6-.6 8-4 8-8V7z')}<span>后台</span></Link>}
              </>
            )}
        </>

        <div className="p-side-foot">
          <Link className="p-user-row" href={userName ? '/me' : '/login'}>
            <span className="p-avatar" style={{ ['--size' as string]: '32px', ['--h' as string]: 28 }}>{userName ? Array.from(userName)[0] : '林'}</span>
            <span><span className="p-user-name">{userName ?? '未登录'}</span><br /><span className="p-user-sub">{userName ? `${points} 点` : '点击登录'}</span></span>
          </Link>
        </div>
      </aside>

      <div className="p-main">
        <header className="p-topbar">
          <form className="p-search" action="/search" role="search">
            {icon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35')}
            <input className="p-input" type="search" name="q" placeholder="搜索角色、作者或剧情" aria-label="搜索角色、作者或剧情" />
            {userName && (
              <button className="rd-kbd-hint" type="button" aria-label="打开快速跳转（Ctrl/⌘ + K）" onClick={() => window.dispatchEvent(new Event('tavern:palette'))}>
                <kbd>⌘</kbd><kbd>K</kbd>
              </button>
            )}
          </form>
          <Link className="p-topbar-icon p-topbar-search" href="/search" aria-label="搜索">
            {icon('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35')}
          </Link>
          <AppearanceButton />
          {userName && (
            <Link className="p-topbar-icon" href="/notifications" aria-label={unread ? `通知，${unread} 条未读` : '通知'}>
              {icon('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4')}
              {unread > 0 && <span className="p-unread-badge">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          {pointsMenu}
          <Link className="p-avatar" href={userName ? '/me' : '/login'} style={{ ['--size' as string]: '36px', ['--h' as string]: 28 }} aria-label={userName ? '我的账号' : '登录'} prefetch={false}>
            {userName ? Array.from(userName)[0] : '林'}
          </Link>
        </header>
        {!adminPage && !pathname.startsWith('/chats/') && !pathname.startsWith('/rooms/') && <AnnouncementBar text={announcement} />}
        <span id="main-content" tabIndex={-1} className="main-anchor" />
        {children}
      </div>

      <nav className="p-tabbar" aria-label="主导航">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}>
            {icon(item.path)}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      {showCheckin && checkin && <CheckinPopup initial={checkin} />}
      {overlays}
    </div>
  );
}
