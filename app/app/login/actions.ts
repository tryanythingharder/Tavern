'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { confirmAge, createUser, endSession, findUserByEmail, isTwoFactorEnabled, startSession, verifyPassword } from '@/lib/auth';
import { createAuthToken } from '@/lib/auth-tokens';
import { authLink, mailConfigured, sendMail } from '@/lib/mail';
import { STARTING_POINTS, ensureStartingPoints } from '@/lib/points';
import { notify } from '@/lib/notifications';
import { inviteRequired, inviteValid, redeemInvite } from '@/lib/invite';
import { isReferralCode, recordReferral, referrerFor } from '@/lib/growth';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { transaction } from '@/lib/db';
import { ageFrom, applyDefaultHide, setBirthDate } from '@/lib/age-gate';

export async function register(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const nickname = String(formData.get('nickname') ?? '').trim() || email.split('@')[0] || '旅人';
  // 从好友专属链接进来的（cookie 里记了有效邀请人）以链接为准，表单改不了
  const lockedRef = (await cookies()).get('tavern_ref')?.value?.trim().toUpperCase() ?? '';
  const invite = lockedRef && isReferralCode(lockedRef) && referrerFor(lockedRef) ? lockedRef : String(formData.get('invite') ?? '').trim().toUpperCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/login?error=' + encodeURIComponent('邮箱格式不对'));
  if (password.length < 8) redirect('/login?error=' + encodeURIComponent('密码至少 8 位'));
  const birthDate = String(formData.get('birth') ?? '').trim();
  const age = ageFrom(birthDate);
  if (age === null || age > 120) redirect('/login?error=' + encodeURIComponent('请填写正确的出生日期'));
  if (age < 18) redirect('/login?error=' + encodeURIComponent('需要年满 18 岁才能注册'));
  if (formData.get('age') !== 'on') redirect('/login?error=' + encodeURIComponent('请确认已年满 18 岁并同意服务条款'));

  const ip = await clientIp();
  const ipLimit = rateLimit('register-ip', [ip], 5, 60 * 60 * 1000);
  const emailLimit = rateLimit('register-email', [email], 3, 60 * 60 * 1000);
  if (!ipLimit.ok || !emailLimit.ok) {
    const wait = !ipLimit.ok ? ipLimit.retryAfter : !emailLimit.ok ? emailLimit.retryAfter : 60;
    redirect('/login?error=' + encodeURIComponent(`注册尝试太频繁，请 ${Math.ceil(wait / 60)} 分钟后再试`));
  }

  if (findUserByEmail(email)) redirect('/login?error=' + encodeURIComponent('这个邮箱已经注册过了'));
  if (inviteRequired() && !invite) redirect('/login?error=' + encodeURIComponent('当前注册需要邀请码'));
  // 好友邀请码（R-XXXXXX）与管理员邀请码（INV-…）共用一个输入框
  const referral = invite && isReferralCode(invite) ? invite : '';
  if (referral && !referrerFor(referral)) redirect('/login?error=' + encodeURIComponent('好友邀请码不存在，检查一下有没有抄错'));
  if (invite && !referral && !inviteValid(invite)) redirect('/login?error=' + encodeURIComponent('邀请码无效或已经被使用'));
  const user = (() => {
    try {
      return transaction(() => {
        const created = createUser(email, password, nickname.slice(0, 20));
        // 邀请码在同一个事务里占用，避免两个注册请求同时通过 inviteValid
        if (invite && !referral && !redeemInvite(invite, created.id)) throw new Error('INVITE_USED');
        return created;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INVITE_USED') {
        redirect('/login?error=' + encodeURIComponent('邀请码无效或已经被使用'));
      }
      throw error;
    }
  })();
  confirmAge(user.id);
  setBirthDate(user.id, birthDate);
  // 广场默认过滤 18+（后台可改），想看的人在广场或「我的」里打开
  applyDefaultHide(user.id);
  ensureStartingPoints(user.id);
  const welcomeBonus = referral ? recordReferral(user.id, referral) : 0;
  notify(user.id, { type: 'system', title: '欢迎来到夜话', body: `已赠送 ${STARTING_POINTS + welcomeBonus} 点${welcomeBonus ? `（含好友邀请见面礼 ${welcomeBonus} 点）` : ''}。先去发现页挑一个角色，或者去「房间」把几个人放进同一个场景。`, link: '/', push: false });
  // 注册后发验证邮件；发信失败不阻塞注册，用户可在「我的」里重发
  try {
    const token = createAuthToken(user.id, 'verify', 24 * 60 * 60 * 1000);
    const link = authLink('/verify', token);
    const sent = await sendMail({
      to: email,
      subject: '验证你的夜话邮箱',
      text: `欢迎来到夜话。\n\n在 24 小时内打开这个链接验证邮箱：\n${link}\n\n验证后可以更安全地找回密码，也能收到审核结果通知。`,
    });
    if (!mailConfigured()) console.info('[mail:outbox] verification email written to outbox');
    if (!sent.ok) console.warn('[mail] verify email failed:', sent.error);
  } catch (error) {
    console.warn('[mail] verify email failed:', error);
  }
  if (referral) (await cookies()).delete('tavern_ref');
  await startSession(user.id);
  redirect('/');
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const ip = await clientIp();
  const ipLimit = rateLimit('login-ip', [ip], 30, 15 * 60 * 1000);
  const accountLimit = rateLimit('login-account', [email, ip], 10, 15 * 60 * 1000);
  if (!ipLimit.ok || !accountLimit.ok) {
    const wait = !ipLimit.ok ? ipLimit.retryAfter : !accountLimit.ok ? accountLimit.retryAfter : 60;
    redirect('/login?mode=login&error=' + encodeURIComponent(`登录尝试太频繁，请 ${Math.ceil(wait / 60)} 分钟后再试`));
  }
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) redirect('/login?mode=login&error=' + encodeURIComponent('邮箱或密码不对'));
  if (user.status === 'banned') redirect('/login?mode=login&error=' + encodeURIComponent('账号已被限制，请联系管理员'));
  if (isTwoFactorEnabled(user.id)) {
    const token = createAuthToken(user.id, '2fa', 5 * 60 * 1000);
    redirect('/login/2fa?token=' + encodeURIComponent(token));
  }
  await startSession(user.id);
  redirect('/');
}

export async function logout() {
  await endSession();
  redirect('/');
}
