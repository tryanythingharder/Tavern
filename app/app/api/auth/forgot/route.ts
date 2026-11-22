import { fail, json } from '@/lib/api';
import { findUserByEmail } from '@/lib/auth';
import { createAuthToken, purgeAuthTokens } from '@/lib/auth-tokens';
import { authLink, mailConfigured, sendMail } from '@/lib/mail';
import { ipFromRequest, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST /api/auth/forgot —— { email }
// 无论邮箱是否存在都返回成功，避免被用来枚举账号。
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return fail('邮箱格式不对', 400);

  const ip = ipFromRequest(request);
  const ipLimit = rateLimit('forgot-ip', [ip], 10, 60 * 60 * 1000);
  const emailLimit = rateLimit('forgot-email', [email], 3, 60 * 60 * 1000);
  if (!ipLimit.ok || !emailLimit.ok) {
    const wait = !ipLimit.ok ? ipLimit.retryAfter : !emailLimit.ok ? emailLimit.retryAfter : 60;
    return fail(`请求太频繁，请 ${Math.ceil(wait / 60)} 分钟后再试`, 429);
  }

  purgeAuthTokens();
  const user = findUserByEmail(email);
  let preview: string | undefined;
  if (user) {
    const token = createAuthToken(user.id, 'reset', 60 * 60 * 1000);
    const link = authLink('/reset', token, request);
    const result = await sendMail({
      to: email,
      subject: '重置你的夜话密码',
      text: `你（或有人用这个邮箱）请求重置夜话密码。\n\n在 1 小时内打开这个链接设置新密码：\n${link}\n\n如果不是你本人操作，可以忽略这封邮件，密码不会改变。`,
    });
    // 邮件失败也返回成功，避免通过 502/200 判断邮箱是否存在；失败写服务端日志。
    if (!result.ok) console.error('[mail] password reset failed:', result.error);
    if (result.preview && process.env.TAVERN_MAIL_PREVIEW === '1') preview = result.preview;
    if (!mailConfigured()) console.info('[mail:outbox] password reset email written to outbox');
  }

  return json({ ok: true, ...(preview ? { preview } : {}) });
}
