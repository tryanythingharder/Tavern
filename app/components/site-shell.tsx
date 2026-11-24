'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CharacterCover } from '@/components/character-cover';
import { AppearanceButton, AppearanceDrawer } from '@/components/appearance-drawer';
import { SchemeToggle } from '@/components/scheme-switch';
import type { AppearancePrefs } from '@/lib/appearance';
import type { Theme } from '@/lib/theme';
import { AnnouncementBar } from '@/components/announcement-bar';
import { CheckinPopup } from '@/components/checkin-popup';
import { MotionLayer } from '@/components/motion-layer';
import { CommandPalette } from '@/components/command-palette';
import { OfflineBanner } from '@/components/offline-banner';
import { SwRegister } from '@/components/sw-register';
import { ErrorReporter } from '@/components/error-reporter';
import { onPoints } from '@/lib/points-bus';
import { AdminMobileNav, AdminSideNav } from '@/components/admin-nav';
import { AccountMenu } from '@/components/account-menu';

// 图标：与原型一致的内联 SVG（class="p-icon"）
const icon = (path: string) => (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d={path} />
  </svg>
);

const NAV = [
  { href: '/', label: '发现', path: 'M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z', page: 'home' },
  { href: '/plaza', label: '广场', path: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.2-11.2-2 4.4-4.4 2 2-4.4z', page: 'plaza' },
  // 模型广场：桌面导航直达；手机底栏放不下第 6 个，留在「我的」里
  { href: '/models', label: '模型', path: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', page: 'models', mobile: false },
  { href: '/chats', label: '对话', path: 'M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z', page: 'chats' },
  { href: '/create', label: '创作', path: 'M12 5v14M5 12h14', page: 'create' },
  { href: '/me', label: '我的', path: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0', page: 'settings' },
] as { href: string; label: string; path: string; page: string; mobile?: boolean }[];
const TAB_NAV = NAV.filter((item) => item.mobile !== false);

type Recent = { id: number; characterId: string; name: string; initial: string; hue: number; owner: number | null; title: string };


export function SiteShell({
  children,
  userName,
  userEmail,
  userAvatar = null,
  points: initialPoints = 0,
  unread = 0,
  admin = false,
  recents = [],
  costs = { text: 2, image: 20, tts: 5 },
  view = 'classic',
  theme = 'folio',
  announcement = '',
  checkin = null,
  wallet = null,
  appearance,
}: {
  children: ReactNode;
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
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
  wallet?: { low: boolean; dailyFree: number; dailyLeft: number; firstTopupPct: number; rebatePct: number } | null;
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
    if (pathname === '/register') return 'login'; // 注册页沿用登录页的样式
    return pathname.split('/')[1] || 'home';
  })();
  // 原型的影院模式只作用于叙事页：home / plaza / character / author
  const narrative = ['home', 'plaza', 'character', 'author'].includes(page);
  // 「我的」：主导航换成返回 + 我的菜单（菜单就是页内的设置目录）
  const meMode = pathname.startsWith('/me');
  const [backHref, setBackHref] = useState('/');
  useEffect(() => {
    try {
      if (!pathname.startsWith('/me')) sessionStorage.setItem('tavern:before-me', pathname + window.location.search);
      else setBackHref(sessionStorage.getItem('tavern:before-me') || '/');
    } catch { /* 无痕模式等 */ }
  }, [pathname]);
  const backLink = (className: string) => (
    <Link className={className} href={backHref} aria-label="返回">
      {icon('M15 18l-6-6 6-6')}
      <span>返回</span>
    </Link>
  );
  const [pointsOpen, setPointsOpen] = useState(false);
  // 生成扣点后同步余额（对话页广播），服务端刷新时以新值为准
  const [points, setPoints] = useState(initialPoints);
  useEffect(() => setPoints(initialPoints), [initialPoints]);
  useEffect(() => onPoints(({ balance }) => setPoints(balance)), []);
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

  const fmt = (value: number) => value.toLocaleString('zh-CN');
  // 一次回复大约 2 千 tokens：粗略换算还能聊多少条，给余额一个直观的尺度
  const replies = costs.text > 0 ? Math.floor(points / (costs.text * 2)) : 0;
  const pointsMenu = userName ? (
    <div className="p-points" ref={pointsRef}>
      <button ref={pointsTriggerRef} className={`p-points-trigger p-wallet-trigger${wallet?.low ? ' is-low' : ''}`} type="button" aria-expanded={pointsOpen} aria-haspopup="dialog" aria-controls="points-panel" aria-label={`点数余额 ${points}${wallet?.low ? '，余额不足' : ''}`} onClick={() => setPointsOpen((value) => !value)}>
        <span className="p-wallet-coin" aria-hidden="true">点</span>
        <span className="p-wallet-num">{fmt(points)}</span>
        {checkin && !checkin.todayDone && <span className="p-wallet-dot" aria-hidden="true" />}
      </button>
      {pointsOpen && (
        <div className="p-points-panel p-wallet" id="points-panel" role="dialog" aria-label="点数钱包">
          <div className="p-wallet-hero">
            <span className="p-wallet-label">点数余额</span>
            <strong className="p-wallet-balance">{fmt(points)}</strong>
            <span className="p-wallet-sub">{wallet?.low ? '余额不多了，生成可能会被暂停' : replies > 0 ? `按默认模型，约够聊 ${fmt(replies)} 条` : '充值后就能继续聊'}</span>
          </div>
          {wallet && wallet.dailyFree > 0 && (
            <div className="p-wallet-row">
              <div><b>今日免费</b><span>{wallet.dailyLeft} / {wallet.dailyFree} 点 · 零点刷新</span></div>
              <i className="p-wallet-meter" aria-hidden="true"><i style={{ width: `${Math.round((wallet.dailyLeft / wallet.dailyFree) * 100)}%` }} /></i>
            </div>
          )}
          {checkin && (
            <Link className="p-wallet-row p-wallet-link" href="/me/points" onClick={() => setPointsOpen(false)}>
              <div><b>每日签到</b><span>{checkin.todayDone ? `今天已签 · 连续 ${checkin.streak} 天` : `今天还没签，可领 ${checkin.amount} 点`}</span></div>
              <em className={checkin.todayDone ? 'is-done' : undefined}>{checkin.todayDone ? '已签到' : '去签到'}</em>
            </Link>
          )}
          {wallet && wallet.firstTopupPct > 0 && (
            <div className="p-wallet-promo">首充多送 <b>{wallet.firstTopupPct}%</b>，第一笔充值到账自动加赠</div>
          )}
          <div className="p-wallet-actions">
            <Link className="p-btn p-btn--primary" href="/me/points" onClick={() => setPointsOpen(false)}>充值</Link>
            <Link className="p-btn" href="/me/points#ledger" onClick={() => setPointsOpen(false)}>明细</Link>
            {wallet && wallet.rebatePct !== 0 && <Link className="p-btn" href="/me/invite" onClick={() => setPointsOpen(false)}>{wallet.rebatePct > 0 ? `邀请返 ${wallet.rebatePct}%` : '邀请好友'}</Link>}
          </div>
          <Link className="p-wallet-foot" href="/models" onClick={() => setPointsOpen(false)}>
            <span>文本 {costs.text} 点/千 tokens · 生图 {costs.image} 点/张 · 语音 {costs.tts} 点/条</span>
            <span aria-hidden="true">各模型价格 →</span>
          </Link>
        </div>
      )}
    </div>
  ) : null;

  const overlays = (
    <>
      <MotionLayer />
      <OfflineBanner />
      <SwRegister />
      <ErrorReporter />
      <AppearanceDrawer theme={theme} initial={appearance} />
      {userName && <CommandPalette recents={recents.map((recent) => ({ id: recent.id, name: recent.name, title: recent.title }))} />}
    </>
  );

  if (pathname.startsWith('/login') || pathname === '/register' || pathname === '/forgot' || pathname === '/reset' || pathname.startsWith('/verify') || pathname === '/terms' || pathname === '/privacy' || pathname === '/guidelines' || pathname === '/support') return <>{children}<MotionLayer /><ErrorReporter /></>;

  // 后台：原型 admin.html 的独立骨架（240px 侧栏 + 主区工具栏）
  if (adminPage) {
    if (!admin) return <>{children}</>;
    return (
      <div className="p-admin">
        <aside className="p-aside">
          <Link className="p-abrand" href="/admin">
            <div className="p-mark">夜</div>
            <div className="p-brand-name">夜话</div>
          </Link>
          <div className="p-abrand-tag"><span className="p-pill p-pill--sm p-pill--outline">管理后台</span></div>
          <AdminSideNav pathname={pathname} />
          <div className="p-side-foot">
            <Link className="p-user-row" href="/me">
              <span className={`p-avatar${userAvatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '32px', ['--h' as string]: 28 }}>{userAvatar ? <img src={userAvatar} alt="" /> : userName ? Array.from(userName)[0] : 'A'}</span>
              <span><span className="p-user-name">{userName ?? '管理员'}</span><br /><span className="p-user-sub">超级管理员</span></span>
            </Link>
            <Link className="p-btn p-btn--sm p-btn--block" href="/">返回前台</Link>
          </div>
        </aside>
        <div className="p-amain">
          <AdminMobileNav pathname={pathname} />
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
          <Link className="cinema-logo" href="/">夜话</Link>
          <div className="cinema-nav-right">
            <SchemeToggle className="pill" />
            <AppearanceButton />
            {userName && (
              <Link className="pill" href="/notifications" aria-label={unread ? `通知，${unread} 条未读` : '通知'}>
                {icon('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4')}
                <span className="pill-label">通知</span>
                {unread > 0 && <span className="p-unread-badge">{unread > 9 ? '9+' : unread}</span>}
              </Link>
            )}
            {pointsMenu}
            <AccountMenu userName={userName} email={userEmail} avatar={userAvatar} points={points} admin={admin} triggerClassName="cinema-account" />
          </div>
        </header>
        <main className="cinema-main" id="main-content" tabIndex={-1}>{children}</main>
        <nav className="p-tabbar" aria-label="主导航">
          {TAB_NAV.map((item) => (
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
    <div className="p-shell" data-section={meMode ? 'me' : undefined}>
      <aside className="p-side">
        <Link className="p-brand" href="/">
          <div className="p-mark">夜</div>
          <div className="p-brand-name">夜话</div>
        </Link>

        {meMode ? (
          <div className="p-side-me">
            {backLink('p-side-back')}
            <span className="p-side-me-title">我的</span>
          </div>
        ) : <>
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
                <Link className="p-side-recent" href="/rooms" aria-label="多角色房间">{icon('M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M15 20a6 6 0 0 1 6-6')}<span>多角色房间</span></Link>
                <Link className="p-side-recent" href="/library" aria-label="我的角色库">{icon('M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 8h6M9 12h6')}<span>我的角色库</span></Link>
                {admin && <Link className="p-side-recent" href="/admin">{icon('M12 3 4 7v6c0 4 3.4 7.4 8 8 4.6-.6 8-4 8-8V7z')}<span>后台</span></Link>}
              </>
            )}
        </>}

        <div className="p-side-foot">
          <Link className="p-user-row" href={userName ? '/me' : '/login'}>
            <span className={`p-avatar${userAvatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '32px', ['--h' as string]: 28 }}>{userAvatar ? <img src={userAvatar} alt="" /> : userName ? Array.from(userName)[0] : '林'}</span>
            <span><span className="p-user-name">{userName ?? '未登录'}</span><br /><span className="p-user-sub">{userName ? `${points} 点` : '点击登录'}</span></span>
          </Link>
        </div>
      </aside>

      <div className="p-main">
        <header className="p-topbar">
          {meMode && backLink('p-topbar-back')}
          <Link className="p-topbar-brand" href="/" aria-label="夜话首页">
            <span className="p-topbar-mark" aria-hidden="true">夜</span>
            <span className="p-topbar-word">夜话</span>
          </Link>
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
          <SchemeToggle className="p-topbar-icon" />
          <AppearanceButton />
          {userName && (
            <Link className="p-topbar-icon" href="/notifications" aria-label={unread ? `通知，${unread} 条未读` : '通知'}>
              {icon('M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4')}
              {unread > 0 && <span className="p-unread-badge">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          {pointsMenu}
          <AccountMenu userName={userName} email={userEmail} avatar={userAvatar} points={points} admin={admin} triggerStyle={{ ['--size' as string]: '36px', ['--h' as string]: 28 }} />
        </header>
        {!adminPage && !pathname.startsWith('/chats/') && !pathname.startsWith('/rooms/') && <AnnouncementBar text={announcement} />}
        <span id="main-content" tabIndex={-1} className="main-anchor" />
        {children}
      </div>

      <nav className="p-tabbar" aria-label="主导航">
        {TAB_NAV.map((item) => (
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
