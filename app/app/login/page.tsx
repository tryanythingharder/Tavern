import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { inviteRequired } from '@/lib/invite';
import { login, register } from './actions';
import { PasswordInput } from '@/components/password-input';

export const metadata: Metadata = { title: '登录' };

const field = (id: string, label: string, type: string, extra: Record<string, string> = {}) => (
  <div className="p-auth-field">
    <label className="p-auth-label" htmlFor={id}>{label}</label>
    {type === 'password'
      ? <PasswordInput className="p-auth-input" id={id} name={id.replace(/^(login|register)-/, '')} {...extra} />
      : <input className="p-auth-input" id={id} name={id.replace(/^(login|register)-/, '')} type={type} {...extra} />}
  </div>
);

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string; ref?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const { error, mode, ref } = await searchParams;
  const refCode = typeof ref === 'string' && /^R-[A-Za-z0-9]{6}$/.test(ref) ? ref.toUpperCase() : '';
  const isLogin = mode === 'login';
  const needInvite = inviteRequired();

  return (
    <div className="p-auth">
      <header className="p-auth-header">
        <Link className="p-auth-wordmark" href="/" aria-label="酒馆首页">(酒馆)</Link>
        <nav className="p-auth-nav" aria-label="账号操作">
          <Link className={`p-btn p-btn--sm${isLogin ? '' : ' p-btn--primary'}`} href="/login" aria-current={isLogin ? undefined : 'page'}>注册开聊</Link>
          <Link className={`p-btn p-btn--sm${isLogin ? ' p-btn--primary' : ''}`} href="/login?mode=login" aria-current={isLogin ? 'page' : undefined}>登录</Link>
        </nav>
      </header>

      <main className="p-auth-stage">
        <section className="p-auth-panel" aria-label="账号登录与注册">
          <div className="p-auth-card">
            {isLogin ? (
              <section aria-labelledby="login-title">
                <p className="p-auth-kicker">欢迎回来</p>
                <h1 id="login-title">继续未完的剧情。</h1>
                <p className="p-auth-lead">登录后回到你的对话、角色库与点数。</p>

                {error && <p className="p-form-error" role="alert">{error}</p>}

                <form action={login} className="p-auth-form">
                  {field('login-email', '邮箱', 'email', { required: 'required', autoComplete: 'email' })}
                  {field('login-password', '密码', 'password', { required: 'required', autoComplete: 'current-password' })}
                  <button className="p-btn p-btn--primary p-auth-button" type="submit">
                    登录
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                  </button>
                </form>

                <p className="p-auth-hint">
                  还没有账号？<Link href="/login">注册开聊</Link> · <Link href="/forgot">忘记密码？</Link>
                </p>
              </section>
            ) : (
              <section aria-labelledby="register-title">
                <p className="p-auth-kicker">你的下一段故事</p>
                <h1 id="register-title">和喜欢的角色，<br />开始你的故事。</h1>
                <p className="p-auth-lead">创建账号，随时回来继续未完的剧情。</p>

                {error && <p className="p-form-error" role="alert">{error}</p>}

                <form action={register} className="p-auth-form">
                  {field('register-nickname', '昵称（选填）', 'text', { placeholder: '角色如何称呼你', maxLength: '20' })}
                  {field('register-email', '邮箱', 'email', { required: 'required', autoComplete: 'email' })}
                  {field('register-invite', needInvite ? '邀请码（必填）' : '邀请码（选填）', 'text', { placeholder: 'INV-XXXX-XXXX 或好友邀请码', ...(refCode ? { defaultValue: refCode } : {}), ...(needInvite ? { required: 'required' } : {}) })}
                  {field('register-password', '密码', 'password', { required: 'required', minLength: '8', autoComplete: 'new-password' })}
                  <span className="p-auth-hint">密码至少 8 位；用 scrypt 哈希保存，不会以明文存储。</span>
                  <label className="p-check" style={{ alignItems: 'flex-start' }}>
                    <input id="register-age" name="age" type="checkbox" required style={{ marginTop: 2 }} />
                    <span>我已年满 18 岁，并同意服务条款、隐私政策与社区准则</span>
                  </label>
                  <p className="p-auth-hint">
                    <Link href="/terms">服务条款</Link> · <Link href="/privacy">隐私政策</Link> · <Link href="/guidelines">社区准则</Link>
                  </p>
                  <button className="p-btn p-btn--primary p-auth-button" type="submit">
                    创建账号并进入
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                  </button>
                </form>

                <p className="p-auth-hint">
                  已有账号？<Link href="/login?mode=login">直接登录</Link>
                </p>
              </section>
            )}
          </div>
        </section>

        <aside className="p-auth-scene" aria-label="雨夜霓虹房间，一段等待开启的故事">
          <img className="p-auth-art" src="/auth-scene.jpg" alt="窗外霓虹映进雨夜房间，新的故事等待开启" />
          <div className="p-auth-scene-copy">
            <div className="p-auth-scene-label">雨夜 · 2077 · 新的身份</div>
            <h2>有些故事，<br />等你推门才开始。</h2>
            <p>城市还未入睡。今晚，你想成为谁？</p>
          </div>
        </aside>
      </main>

      <footer className="p-auth-footer">
        <span>仅限 18 周岁以上 · 沉浸式角色扮演</span>
        <Link href="/support">帮助</Link>
        <Link href="/terms">服务条款</Link>
        <Link href="/privacy">隐私政策</Link>
      </footer>
    </div>
  );
}
