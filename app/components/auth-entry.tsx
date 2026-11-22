import Link from 'next/link';
import { AuthShell, AuthTabs } from '@/components/auth-scene';
import { cookies } from 'next/headers';
import { referralInviter } from '@/lib/growth';
import { inviteRequired } from '@/lib/invite';
import { login, register } from '@/app/login/actions';
import { PasswordInput } from '@/components/password-input';
import { DateFormField } from '@/components/ui-date';


const field = (id: string, label: string, type: string, extra: Record<string, string> = {}) => (
  <div className="p-auth-field">
    <label className="p-auth-label" htmlFor={id}>{label}</label>
    {type === 'password'
      ? <PasswordInput className="p-auth-input" id={id} name={id.replace(/^(login|register)-/, '')} {...extra} />
      : <input className="p-auth-input" id={id} name={id.replace(/^(login|register)-/, '')} type={type} {...extra} />}
  </div>
);

// 登录页与独立注册页共用的门内表单。/login 默认登录；/register 默认注册（保留 ?ref= 好友码）。
export async function AuthEntry({ view, open, error, refParam }: { view: 'login' | 'register'; open: boolean; error?: string; refParam?: string }) {
  // 链接上的 ?ref= 优先，其次是之前逛站时记下的 cookie（middleware 写入）
  const cookieRef = (await cookies()).get('tavern_ref')?.value ?? '';
  const rawRef = typeof refParam === 'string' && refParam ? refParam : cookieRef;
  const refCode = /^R-[A-Z0-9]{6}$/i.test(rawRef) ? rawRef.toUpperCase() : '';
  const inviter = refCode ? referralInviter(refCode) : null;
  const isLogin = view === 'login';
  const needInvite = inviteRequired();
  // 通过好友专属链接进来：邀请码锁定，不能改（服务端也以 cookie 为准）
  const locked = inviter ? refCode : '';
  const showInvite = needInvite && !locked;

  return (
    <AuthShell mode={isLogin ? 'login' : 'register'} open={open}>
        <section className="p-door-panel" data-layout={isLogin ? 'login' : 'register'} aria-label="账号登录与注册">
          <AuthTabs mode={isLogin ? 'login' : 'register'} />
            {isLogin ? (
              <section aria-labelledby="login-title">
                <div className="p-door-panel-head">
                  <p className="p-auth-kicker">欢迎回来</p>
                  <h1 id="login-title">继续未完的剧情</h1>
                </div>

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
                  <span>登录后回到你的对话、角色库与点数</span>
                  <Link href="/forgot">忘记密码？</Link>
                </p>
              </section>
            ) : (
              <section aria-labelledby="register-title">
                <div className="p-door-panel-head">
                  <p className="p-auth-kicker">你的下一段故事</p>
                  <h1 id="register-title">推开门，和 TA 开始</h1>
                </div>

                {inviter && (
                  <div className="p-auth-invite" role="note">
                    <span className="p-auth-invite-avatar" aria-hidden="true">{inviter.nickname.slice(0, 1)}</span>
                    <span><b>{inviter.nickname}</b> 邀请你来夜话{inviter.bonus > 0 ? <>，注册即多得 <b>{inviter.bonus}</b> 点</> : null}。</span>
                  </div>
                )}
                {error && <p className="p-form-error" role="alert">{error}</p>}

                <form action={register} className="p-auth-form">
                  {field('register-email', '邮箱', 'email', { required: 'required', autoComplete: 'email' })}
                  {locked && (
                    <div className="p-auth-field">
                      <span className="p-auth-label">邀请码</span>
                      <div className="p-auth-locked" aria-label={`邀请码 ${locked}，已锁定`}>
                        <code>{locked}</code>
                        <span>好友专属链接 · 已锁定</span>
                      </div>
                      <input type="hidden" name="invite" value={locked} />
                    </div>
                  )}
                  {showInvite && field('register-invite', '邀请码（必填）', 'text', { placeholder: 'INV-XXXX 或好友码 R-XXXX', autoCapitalize: 'characters', spellCheck: 'false', required: 'required' })}
                  <div className="p-auth-field">
                    <label className="p-auth-label" htmlFor="register-birth">出生日期</label>
                    <DateFormField id="register-birth" name="birth" className="p-auth-input" min="1900-01-01" />
                  </div>
                  {field('register-password', '密码', 'password', { required: 'required', minLength: '8', placeholder: '至少 8 位', autoComplete: 'new-password' })}
                  <details className="p-auth-more">
                    <summary>{showInvite || locked ? '填写昵称' : '填写昵称或邀请码'}<span>选填</span></summary>
                    <div className="p-auth-more-body">
                      {field('register-nickname', '昵称', 'text', { placeholder: '角色如何称呼你', maxLength: '20' })}
                      {!showInvite && !locked && field('register-invite', '邀请码（选填）', 'text', { placeholder: 'INV-XXXX 或好友码 R-XXXX', autoCapitalize: 'characters', spellCheck: 'false' })}
                    </div>
                  </details>
                  <div className="p-door-submit">
                  <label className="p-check" style={{ alignItems: 'flex-start' }}>
                    <input id="register-age" name="age" type="checkbox" required style={{ marginTop: 2 }} />
                    <span>已年满 18 岁、出生日期属实，并同意<Link href="/terms">服务条款</Link>、<Link href="/privacy">隐私政策</Link>与<Link href="/guidelines">社区准则</Link></span>
                  </label>
                  <button className="p-btn p-btn--primary p-auth-button" type="submit">
                    创建账号并进入
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                  </button>
                  </div>
                </form>
              </section>
            )}
        </section>
    </AuthShell>
  );
}
