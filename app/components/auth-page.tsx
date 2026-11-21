import Link from 'next/link';
import { LanguageSwitch } from '@/components/language-switch';
import { AuthScene } from '@/components/auth-scene';
import type { ReactNode } from 'react';

// 登录 / 找回密码 / 验证邮箱共用同一套 p-auth 版式
export function AuthPage({ kicker, title, lead, children }: { kicker: string; title: ReactNode; lead: string; children: ReactNode }) {
  return (
    <div className="p-auth">
      <header className="p-auth-header">
        <Link className="p-auth-wordmark" href="/" aria-label="夜话首页">(夜话)</Link>
        <nav className="p-auth-nav" aria-label="账号操作">
          <Link className="p-btn p-btn--sm" href="/login">注册开聊</Link>
          <Link className="p-btn p-btn--sm" href="/login?mode=login">登录</Link>
        </nav>
      </header>

      <main className="p-auth-stage">
        <section className="p-auth-panel" aria-label="账号操作">
          <div className="p-auth-card">
            <p className="p-auth-kicker">{kicker}</p>
            <h1>{title}</h1>
            <p className="p-auth-lead">{lead}</p>
            {children}
          </div>
        </section>
        <AuthScene />
      </main>

      <footer className="p-auth-footer">
        <span>仅限 18 周岁以上 · 沉浸式角色扮演</span>
        <Link href="/support">帮助</Link>
        <Link href="/terms">服务条款</Link>
        <Link href="/privacy">隐私政策</Link>
        <LanguageSwitch variant="link" />
      </footer>
    </div>
  );
}
