import { fail, json, requireUser } from '@/lib/api';
import { findUserByEmail, getPasswordHash, verifyPassword } from '@/lib/auth';
import { createAuthToken } from '@/lib/auth-tokens';
import { authLink, mailConfigured, sendMail } from '@/lib/mail';
import { rateLimit } from '@/lib/rate-limit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST /api/me/email —— { email, password } 向新邮箱发确认链接，确认后才真正更换
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { email?: unknown; password?: unknown };
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!EMAIL_RE.test(email)) return fail('邮箱格式不对', 400);
  if (email === user.email.toLowerCase()) return fail('新邮箱和当前邮箱相同', 400);
  if (findUserByEmail(email)) return fail('这个邮箱已经被其他账号使用', 400);
  const stored = getPasswordHash(user.id);
  if (!stored || !verifyPassword(password, stored)) return fail('密码不对', 400);

  const limit = rateLimit('email-change', [String(user.id)], 3, 60 * 60 * 1000);
  if (!limit.ok) return fail(`发送太频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`, 429);

  const token = createAuthToken(user.id, 'email', 60 * 60 * 1000, email);
  const link = authLink('/verify-email', token, request);
  const result = await sendMail({
    to: email,
    subject: '确认你的新邮箱',
    text: `你正在把夜话账号的邮箱更换为这个地址。\n\n在 1 小时内打开链接确认：\n${link}\n\n如果不是你本人操作，请忽略这封邮件，当前邮箱不会改变。`,
  });
  if (!result.ok) return fail(result.error ?? '邮件发送失败，请稍后再试', 502);
  if (!mailConfigured()) console.info('[mail:outbox] email change confirmation written to outbox');
  return json({ ok: true, ...(result.preview && process.env.TAVERN_MAIL_PREVIEW === '1' ? { preview: result.preview } : {}) });
}
