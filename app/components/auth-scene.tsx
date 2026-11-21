import Link from 'next/link';
import { authRoster } from '@/lib/auth-wall';
import { AuthRoster } from '@/components/auth-roster';

// 登录 / 注册右侧「名册」：角色名索引 + 跟随的立绘（参考 197 Historias / Grids 的编辑部版式），三套主题共用


export function AuthScene() {
  return (
    <aside className="p-auth-scene p-auth-scene--roster" aria-hidden="true">
      <AuthRoster entries={authRoster()} />
    </aside>
  );
}

// 登录页顶栏：品牌 + 一个切换链接
export function AuthHeader({ mode }: { mode: 'login' | 'register' | 'other' }) {
  return (
    <header className="p-auth-header">
      <Link className="p-auth-wordmark" href="/" aria-label="夜话首页">
        <span className="p-auth-seal" aria-hidden="true">夜</span>
        <span>夜话</span>
      </Link>
      <nav className="p-auth-nav" aria-label="账号操作">
        {mode === 'login'
          ? <><span className="p-auth-nav-note">还没有账号？</span><Link className="p-btn p-btn--sm" href="/login">注册</Link></>
          : mode === 'register'
            ? <><span className="p-auth-nav-note">已有账号？</span><Link className="p-btn p-btn--sm" href="/login?mode=login">登录</Link></>
            : <Link className="p-btn p-btn--sm" href="/login?mode=login">登录</Link>}
      </nav>
    </header>
  );
}

export function AuthTabs({ mode }: { mode: 'login' | 'register' }) {
  return (
    <nav className="p-auth-tabs" aria-label="登录或注册">
      <Link href="/login?mode=login" aria-current={mode === 'login' ? 'page' : undefined}>登录</Link>
      <Link href="/login" aria-current={mode === 'register' ? 'page' : undefined}>注册</Link>
    </nav>
  );
}
