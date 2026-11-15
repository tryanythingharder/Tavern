import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SiteShell } from '@/components/site-shell';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { balance, ensureStartingPoints } from '@/lib/points';
import { unreadCount } from '@/lib/notifications';
import { listChats } from '@/lib/db';
import { imageCost, ttsCost } from '@/lib/media';
import { pointsSummary } from '@/lib/points';
import { getViewMode } from '@/lib/view';
import { getAppearancePrefs, getTheme } from '@/lib/theme';
import { getPlayMode } from '@/lib/play-mode-server';
import { PlayModeChooser } from '@/components/play-mode';
import { appearanceBodyProps } from '@/lib/appearance';
import { getAppearance } from '@/lib/prefs';
import { announcementText } from '@/lib/announcement';
import { checkinStatus } from '@/lib/checkin';
import './globals.css';
// 原型样式：直接引入，让页面 DOM 使用原型的 p-* / ca-* 类名
// 顺序对齐原型的 chat.html：immersive 最后，页面级覆盖才生效
import '../styles/proto/proto.css';
import '../styles/proto/platform.css';
import '../styles/proto/editorial.css';
import '../styles/proto/platform-pages.css';
import '../styles/proto/platform-polish.css';
import '../styles/proto/cinema.css';
import '../styles/proto/discovery.css';
import '../styles/proto/immersive.css';
import '../styles/proto/admin-proto.css';
import '../styles/proto/admin-shell.css';
import '../styles/proto/auth.css';
import '../styles/app-overrides.css';
// 重设计层：最后导入，只调整层次、质感与动效，不改配色令牌
import '../styles/redesign.css';
// 三套主题：各自只在 body[data-theme=...] 下生效
import '../styles/themes/shared.css';
import '../styles/themes/folio.css';
import '../styles/themes/stage.css';
// 用户自定义外观：只在 body[data-u-*] 存在时覆盖主题，必须最后导入
import '../styles/themes/custom.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3100'),
  title: { default: '酒馆 · 角色扮演', template: '%s · 酒馆' },
  description: '和喜欢的角色开始一段故事。保持 SillyTavern 的能力，做成更好用的前端。',
  applicationName: '酒馆',
  appleWebApp: { capable: true, title: '酒馆', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

// viewport-fit=cover 让 env(safe-area-inset-*) 在 iOS 刘海屏/底部横条上生效
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#ffffff' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const view = await getViewMode();
  const theme = await getTheme();
  const playMode = await getPlayMode();
  const appearance = getAppearance(user?.id ?? null);
  const custom = await getAppearancePrefs();
  const customBody = appearanceBodyProps(custom);
  const announcement = announcementText();
  const checkin = user ? checkinStatus(user.id) : null;
  let points = 0;
  let unread = 0;
  let recents: { id: number; characterId: string; name: string; initial: string; hue: number; owner: number | null; title: string }[] = [];
  let costs = { text: 2, image: 20, tts: 5 };
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
    costs = { text: pointsSummary(user.id).perThousand, image: imageCost(), tts: ttsCost() };
  }
  return (
    <html lang="zh-CN">
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
        {/* 首屏在 hydration 前就定好页面/视图标记，避免切页时先闪一下旧排版 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var p=location.pathname;var k=p==='/'?'home':p.indexOf('/c/')===0?'character':p.indexOf('/chats/')===0?'chat':p.indexOf('/chats')===0?'chats':p.indexOf('/a/')===0?'author':p.indexOf('/rooms/')===0?'chat':p.indexOf('/rooms')===0?'rooms':p.indexOf('/create')===0?'create':p.indexOf('/library')===0?'library':p.indexOf('/notifications')===0?'notifications':p.indexOf('/me')===0?'settings':p.indexOf('/admin')===0?'admin':(p.split('/')[1]||'home');var cinema=${JSON.stringify(view)}==='cinema'&&['home','plaza','character','author'].indexOf(k)>=0;document.body.dataset.page=k;document.body.dataset.view=cinema?'cinema':'classic';document.body.classList.toggle('p-cinema',cinema);try{if(localStorage.getItem('tavern-announcement-dismissed')==='1')document.body.classList.add('announcement-off')}catch(e){}})();`,
          }}
        />
        <SiteShell userName={user?.nickname} points={points} unread={unread} admin={user ? isAdmin(user) : false} recents={recents} costs={costs} view={view} theme={theme} appearance={custom} announcement={announcement} checkin={checkin}>
          {children}
        </SiteShell>
        {user && !playMode ? <PlayModeChooser /> : null}
      </body>
    </html>
  );
}
