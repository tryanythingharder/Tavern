import Link from 'next/link';
import { authWallColumns } from '@/lib/auth-wall';

// 登录 / 注册右侧场景：夜色里缓缓流动的角色立绘拼贴，三套主题共用（只换字体与强调色）


export function AuthScene() {
  const columns = authWallColumns();
  return (
    <aside className="p-auth-scene" aria-hidden="true">
      <div className="p-auth-wall">
        {columns.map((col, i) => (
          <div className="p-auth-col" data-col={i} key={i}>
            {[...col, ...col].map((src, j) => (
              <img key={j} src={src} alt="" loading={j < 3 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
        ))}
      </div>
      <div className="p-auth-scene-copy">
        <div className="p-auth-scene-label">夜话 · YEHUA</div>
        <h2>夜深了，<br />故事才刚开始。</h2>
        <p>今晚，想和谁说说话？</p>
      </div>
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
