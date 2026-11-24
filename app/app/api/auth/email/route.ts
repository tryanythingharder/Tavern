import { fail, json } from '@/lib/api';
import { findUserByEmail, revokeAllSessions, updateEmail } from '@/lib/auth';
import { authTokenMeta, consumeAuthToken, peekAuthToken } from '@/lib/auth-tokens';
import { ipFromRequest, rateLimit } from '@/lib/rate-limit';
import { jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/auth/email —— { token } 确认新邮箱并完成更换
export async function POST(request: Request) {
  // 未登录可调：请求体只会是几个短字段，先限 16KB 再读
  const parsed = await jsonOr413(request, 16 * 1024, {});
  if (parsed instanceof Response) return parsed;
  const body = (parsed ?? {}) as { token?: string };
  const token = String(body.token ?? '');
  const userId = peekAuthToken(token, 'email');
  if (!userId) return fail('链接无效或已过期，请重新申请', 400);

  const limit = rateLimit('email-verify', [token, ipFromRequest(request)], 10, 5 * 60 * 1000);
  if (!limit.ok) return fail(`尝试太频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`, 429);

  const email = authTokenMeta(token, 'email');
  if (!email) return fail('链接无效，请重新申请', 400);
  const existing = findUserByEmail(email);
  if (existing && existing.id !== userId) return fail('这个邮箱已经被其他账号使用', 400);

  consumeAuthToken(token, 'email');
  updateEmail(userId, email);
  // 邮箱是账号关键凭据，换绑后让所有旧会话重新登录
  revokeAllSessions(userId);
  return json({ ok: true, relogin: true });
}
