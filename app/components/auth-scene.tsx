import Link from 'next/link';
import type { ReactNode } from 'react';
import { AuthDoors } from '@/components/auth-doors';
import { LanguageSwitch } from '@/components/language-switch';
import { pageCssHref } from '@/lib/css-assets';
import '../styles/proto/auth.css';

// 登录 / 注册 / 找回密码等共用的外壳：照 Thorgal 首页复刻的「五扇门」，账号表单在居中展开的面板里。三套主题共用。

export function AuthShell({ mode, open = false, children }: { mode: 'login' | 'register' | 'other'; open?: boolean; children: ReactNode }) {
  return (
    <div className="p-auth">
      {pageCssHref('auth') ? <link rel="stylesheet" href={pageCssHref('auth')} precedence="yh-page" /> : null}
      <AuthDoors
        mode={mode}
        initialOpen={open}
        footer={(
          <>
            <Link href="/support">帮助</Link>
            <Link href="/terms">用户协议</Link>
            <Link href="/privacy">隐私政策</Link>
            <LanguageSwitch variant="link" />
          </>
        )}
      >
        <main className="p-auth-stage">{children}</main>
      </AuthDoors>
    </div>
  );
}

export function AuthTabs({ mode }: { mode: 'login' | 'register' }) {
  return (
    <nav className="p-auth-tabs" aria-label="登录或注册">
      <Link href="/login?mode=login" aria-current={mode === 'login' ? 'page' : undefined}>登录</Link>
      <Link href="/register" aria-current={mode === 'register' ? 'page' : undefined}>注册</Link>
    </nav>
  );
}
