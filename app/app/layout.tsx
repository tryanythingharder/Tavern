import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site-shell';
import { getCurrentUser, getProfileMedia, isAdmin } from '@/lib/auth';
import { balance, ensureStartingPoints } from '@/lib/points';
import { unreadCount } from '@/lib/notifications';
import { listChats } from '@/lib/db';
import { imageCost, ttsCost } from '@/lib/media';
import { pointsSummary } from '@/lib/points';
import { getViewMode } from '@/lib/view';
import { getAppearancePrefs, getScheme, getTheme } from '@/lib/theme';
import { getPlayMode } from '@/lib/play-mode-server';
import { PlayModeChooser } from '@/components/play-mode';
import { appearanceBodyProps } from '@/lib/appearance';
import { getAppearance } from '@/lib/prefs';
import { announcementText } from '@/lib/announcement';
import { checkinStatus } from '@/lib/checkin';
import { dailyFreeRemaining, firstTopupEligible, growthConfig } from '@/lib/growth';
import Script from 'next/script';
import { LocaleGuard } from '@/components/locale-guard';
import { FormValidity } from '@/components/form-validity';
import { getLocale, dictVersion } from '@/lib/i18n/server';
import './globals.css';
// 原型样式：直接引入，让页面 DOM 使用原型的 p-* / ca-* 类名
// 顺序对齐原型的 chat.html：immersive 最后，页面级覆盖才生效
import '../styles/proto/proto.css';
import '../styles/proto/platform.css';
import '../styles/proto/editorial.css';
import '../styles/proto/platform-pages.css';
import '../styles/proto/platform-polish.css';
import '../styles/proto/discovery.css';
import '../styles/proto/immersive.css';
import '../styles/proto/admin-shared.css';
import '../styles/app-overrides.css';
// 重设计层：最后导入，只调整层次、质感与动效，不改配色令牌
import '../styles/redesign.css';
// 三套主题：各自只在 body[data-theme=...] 下生效
import '../styles/themes/shared.css';
// 当前主题（styles/themes/<t>.css）与排在主题之后的全局样式（custom、dark…i18n-en）
// 由 scripts/build-css.mjs 预构建到 public/_css/，下面用 precedence 分组按原顺序加载，只下载当前主题那份。
import { postCssHref, themeCssHref, themeCssMap } from '@/lib/css-assets';
import { ogImage } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'),
  title: { default: '夜话 · 角色扮演', template: '%s · 夜话' },
  description: '夜话是一个角色扮演故事平台：挑一扇门，和角色开始一段只属于你的故事。兼容 SillyTavern 角色卡、世界书与预设。',
  applicationName: '夜话',
  openGraph: { type: 'website', siteName: '夜话 Yehua', images: [{ url: ogImage(), width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', images: [ogImage()] },
  appleWebApp: { capable: true, title: '夜话', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
});
}

// viewport-fit=cover 让 env(safe-area-inset-*) 在 iOS 刘海屏/底部横条上生效
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#151413' }] };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const view = await getViewMode();
  const theme = await getTheme();
  const scheme = await getScheme();
  const playMode = await getPlayMode();
  const appearance = getAppearance(user?.id ?? null);
  const custom = await getAppearancePrefs();
  const customBody = appearanceBodyProps(custom);
  const announcement = announcementText();
  const checkin = user ? checkinStatus(user.id) : null;
  const locale = await getLocale();
  let points = 0;
  let unread = 0;
  let recents: { id: number; characterId: string; name: string; initial: string; hue: number; owner: number | null; title: string }[] = [];
  let costs = { text: 2, image: 20, tts: 5 };
  let wallet: { low: boolean; dailyFree: number; dailyLeft: number; firstTopupPct: number; rebatePct: number } | null = null;
  if (user) {
    ensureStartingPoints(user.id);
    points = balance(user.id);
    unread = unreadCount(user.id);
    recents = listChats(user.id).slice(0, 3).map((chat) => ({
      id: chat.id,
      characterId: chat.character_id,
      name: chat.character_name,
      initial: chat.character_initial,
      hue: chat.character_hue,
      owner: chat.character_owner,
      title: chat.title,
    }));
    const summary = pointsSummary(user.id);
    costs = { text: summary.perThousand, image: imageCost(), tts: ttsCost() };
    const growth = growthConfig();
    wallet = { low: summary.low, dailyFree: growth.dailyFree, dailyLeft: growth.dailyFree ? dailyFreeRemaining(user.id) : 0, firstTopupPct: growth.firstTopupPct && firstTopupEligible(user.id) ? growth.firstTopupPct : 0, rebatePct: growth.rebatePct || (growth.inviteReward > 0 ? -1 : 0) };
  }
  return (
    <html lang={locale === 'en' ? 'en' : 'zh-CN'} data-lang={locale} data-scheme-pref={scheme} data-scheme={scheme === 'dark' ? 'dark' : scheme === 'light' ? 'light' : undefined} suppressHydrationWarning>
      <head>
        {/* 明暗：跟随系统时在首帧前读系统设置，避免白闪；系统切换时同步 */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var r=document.documentElement,q=window.matchMedia('(prefers-color-scheme: dark)');function a(){var p=r.dataset.schemePref||'system';r.dataset.scheme=p==='dark'||(p==='system'&&q.matches)?'dark':'light'}a();try{q.addEventListener('change',a)}catch(e){q.addListener&&q.addListener(a)}})();` }} />
        {/* 界面语言：英文时在 hydration 前加载词典，客户端渲染与服务端一致 */}
        <script dangerouslySetInnerHTML={{ __html: `window.__TAVERN_LANG=${JSON.stringify(locale)};` }} />
        <script dangerouslySetInnerHTML={{ __html: `try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z&&document.cookie.indexOf('tavern_tz='+encodeURIComponent(z))<0)document.cookie='tavern_tz='+encodeURIComponent(z)+';path=/;max-age=31536000;samesite=lax'}catch(e){}` }} />
        {locale === 'en' ? <Script src={`/i18n-en.js?v=${dictVersion()}`} strategy="beforeInteractive" /> : null}
        {/* 层叠顺序：Next 打包的样式（precedence=next）→ 当前主题 → 主题之后的样式 */}
        {themeCssHref(theme) ? <link rel="stylesheet" href={themeCssHref(theme)} precedence="yh-theme" /> : null}
        {postCssHref() ? <link rel="stylesheet" href={postCssHref()} precedence="yh-post" /> : null}
        <script dangerouslySetInnerHTML={{ __html: `window.__YH_THEME_CSS=${JSON.stringify(themeCssMap())};` }} />
      </head>
      <body
        // 首屏脚本会在 hydration 前改写 data-page / data-view / class，这是有意的
        suppressHydrationWarning
        data-view={view}
        data-theme={theme}
        data-mode={playMode ?? 'newbie'}
        data-chat-bg={appearance.background}
        {...customBody.data}
        style={{ ['--rp-font-scale' as string]: String(appearance.fontScale / 100), ...customBody.vars }}
      >
        {/* 背景色调滤镜层：仅在用户选了色调时由 CSS 显示 */}
        <a className="skip-link" href="#main-content">跳到正文</a>
        <div className="ua-tint" aria-hidden="true" />
        <FormValidity />
        {/* 首屏在 hydration 前就定好页面/视图标记，避免切页时先闪一下旧排版 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=location.pathname;var k=p==='/'?'home':p.indexOf('/c/')===0?'character':p.indexOf('/chats/')===0?'chat':p.indexOf('/chats')===0?'chats':p.indexOf('/a/')===0?'author':p.indexOf('/rooms/')===0?'chat':p.indexOf('/rooms')===0?'rooms':p.indexOf('/create')===0?'create':p.indexOf('/library')===0?'library':p.indexOf('/notifications')===0?'notifications':p.indexOf('/me')===0?'settings':p.indexOf('/admin')===0?'admin':(p.split('/')[1]||'home');var cinema=${JSON.stringify(view)}==='cinema'&&['home','plaza','character','author'].indexOf(k)>=0;document.body.dataset.page=k;document.body.dataset.view=cinema?'cinema':'classic';document.body.classList.toggle('p-cinema',cinema);try{var at=${JSON.stringify(announcement.trim()).replace(/</g, '\\u003c')};var ah=5381;for(var i=0;i<at.length;i++)ah=((ah<<5)+ah+at.charCodeAt(i))|0;if(localStorage.getItem('tavern-announcement-dismissed')===(ah>>>0).toString(36))document.body.classList.add('announcement-off')}catch(e){}})();`,
          }}
        />
        <SiteShell userName={user?.nickname} userEmail={user?.email} userAvatar={user ? getProfileMedia(user.id).avatar : null} points={points} unread={unread} admin={user ? isAdmin(user) : false} recents={recents} costs={costs} view={view} theme={theme} appearance={custom} announcement={announcement} checkin={checkin} wallet={wallet}>
          {children}
        </SiteShell>
        {user && !playMode ? <PlayModeChooser /> : null}
        <LocaleGuard locale={locale} />
      </body>
    </html>
  );
}
