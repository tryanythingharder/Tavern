import { fail, json, requireUser } from '@/lib/api';
import { isEmailVerified } from '@/lib/auth';
import { createAuthToken } from '@/lib/auth-tokens';
import { authLink, mailConfigured, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify/resend —— 重新发送验证邮件（24 小时有效）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (isEmailVerified(user.id)) return fail('邮箱已经验证过了', 400);
  const limit = rateLimit('verify-resend', [String(user.id)], 3, 60 * 60 * 1000);
  if (!limit.ok) return fail(`发送太频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`, 429);

  const token = createAuthToken(user.id, 'verify', 24 * 60 * 60 * 1000);
  const link = authLink('/verify', token, request);
  const result = await sendMail({
    to: user.email,
    subject: '验证你的夜话邮箱',
    text: `欢迎来到夜话。\n\n在 24 小时内打开这个链接验证邮箱：\n${link}\n\n验证后可以更安全地找回密码，也能收到审核结果通知。`,
  });
  if (!result.ok) return fail(result.error ?? '邮件发送失败，请稍后再试', 502);
  if (!mailConfigured()) console.info('[mail:outbox] verification email written to outbox');
  return json({ ok: true, ...(result.preview && process.env.TAVERN_MAIL_PREVIEW === '1' ? { preview: result.preview } : {}) });
}
