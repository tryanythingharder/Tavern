'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { askConfirm } from '@/components/ui-dialog';

// 退出登录：二次确认后 POST /logout，再整页跳到登录页（清掉客户端缓存的已登录页面）
export async function confirmLogout(): Promise<void> {
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  const ok = await askConfirm({
    title: en ? 'Sign out?' : '退出登录？',
    message: en ? 'You will need to sign in again to keep chatting. Your stories and settings stay saved.' : '退出后需要重新登录才能继续聊天，你的故事和设置都会保留。',
    confirmLabel: en ? 'Sign out' : '退出登录',
    danger: true,
  });
  if (!ok) return;
  try {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
  } catch { /* 网络失败也跳转：GET /logout 兜底 */
    window.location.href = '/logout';
    return;
  }
  window.location.href = '/login';
}

export function LogoutButton({ className, style, children }: { className?: string; style?: CSSProperties; children?: React.ReactNode }) {
  return (
    <button className={className} style={style} type="button" onClick={() => void confirmLogout()}>
      {children ?? '退出登录'}
    </button>
  );
}

const ic = (d: string) => (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);

/**
 * 顶栏头像下拉：个人信息 / 设置 / 退出登录。
 * 触发钮保持为顶栏的直接子元素（主题样式写的是 `.p-topbar > .p-avatar`），
 * 面板用 fixed 定位，按触发钮位置贴右下对齐。
 */
export function AccountMenu({
  userName,
  email,
  avatar = null,
  points,
  admin = false,
  triggerClassName = 'p-avatar',
  triggerStyle,
}: {
  userName?: string;
  email?: string;
  avatar?: string | null;
  points: number;
  admin?: boolean;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const initial = userName ? Array.from(userName)[0] : '';

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: Math.round(rect.bottom + 10), right: Math.max(12, Math.round(window.innerWidth - rect.right)) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  // 方向键在菜单项间移动
  const onPanelKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next]?.focus();
    event.preventDefault();
  };

  if (!userName) {
    return (
      <Link className={triggerClassName} href="/login" style={triggerStyle} aria-label="登录" prefetch={false}>林</Link>
    );
  }

  const close = () => setOpen(false);
  const fmt = (value: number) => value.toLocaleString('zh-CN');

  return (
    <>
      <button
        ref={triggerRef}
        className={`${triggerClassName} p-umenu-trigger${avatar ? ' p-avatar--art' : ''}`}
        style={triggerStyle}
        type="button"
        aria-label="我的账号"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        data-open={open ? '' : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {avatar ? <img src={avatar} alt="" /> : initial}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="p-points-panel p-umenu"
          id="account-menu"
          role="menu"
          aria-label="我的账号"
          style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }}
          onKeyDown={onPanelKey}
        >
          <Link className="p-umenu-head" href="/me" role="menuitem" onClick={close}>
            <span className={`p-umenu-avatar${avatar ? ' has-image' : ''}`} aria-hidden="true">{avatar ? <img src={avatar} alt="" /> : initial}</span>
            <span className="p-umenu-id">
              <b>{userName}</b>
              {email && <span className="p-umenu-mail">{email}</span>}
            </span>
          </Link>
          <div className="p-umenu-meta">
            <span>点数余额 <b>{fmt(points)}</b></span>
            {admin && <em>管理员</em>}
          </div>
          <div className="p-umenu-list">
            <Link className="p-umenu-item" href="/me" role="menuitem" onClick={close}>
              {ic('M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5 20a7 7 0 0 1 14 0')}
              <span>个人信息</span>
            </Link>
            <Link className="p-umenu-item" href="/me/security" role="menuitem" onClick={close}>
              {ic('M12 3 4 7v6c0 4 3.4 7.4 8 8 4.6-.6 8-4 8-8V7z')}
              <span>账号与安全</span>
            </Link>
            <Link className="p-umenu-item" href="/me/appearance" role="menuitem" onClick={close}>
              {ic('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z')}
              <span>设置</span>
            </Link>
            <Link className="p-umenu-item" href="/me/points" role="menuitem" onClick={close}>
              {ic('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v10M9 9.5h4.5a1.75 1.75 0 0 1 0 3.5h-3a1.75 1.75 0 0 0 0 3.5H15')}
              <span>点数与充值</span>
            </Link>
            {admin && (
              <Link className="p-umenu-item" href="/admin" role="menuitem" onClick={close}>
                {ic('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z')}
                <span>管理后台</span>
              </Link>
            )}
          </div>
          <div className="p-umenu-foot">
            <button className="p-umenu-item p-umenu-out" type="button" role="menuitem" onClick={() => { close(); void confirmLogout(); }}>
              {ic('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4')}
              <span>退出登录</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
