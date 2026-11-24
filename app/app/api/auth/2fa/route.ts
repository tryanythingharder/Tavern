import { fail, json } from '@/lib/api';
import { startSession, verifyTwoFactor } from '@/lib/auth';
import { consumeAuthToken, peekAuthToken } from '@/lib/auth-tokens';
import db from '@/lib/db';
import { ipFromRequest, rateLimit } from '@/lib/rate-limit';
import { jsonOr413 } from '@/lib/body-limit';
import { logActivity } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/auth/2fa —— { token, code } 登录第二步：TOTP 或恢复码
export async function POST(request: Request) {
  // 未登录可调：请求体只会是几个短字段，先限 16KB 再读
  const parsed = await jsonOr413(request, 16 * 1024, {});
  if (parsed instanceof Response) return parsed;
  const body = (parsed ?? {}) as { token?: string; code?: string };
  const token = String(body.token ?? '');
  const code = String(body.code ?? '').trim();
  const userId = peekAuthToken(token, '2fa');
  if (!userId) return fail('验证会话已过期，请重新登录', 400);

  const limit = rateLimit('2fa-verify', [token, ipFromRequest(request)], 10, 5 * 60 * 1000);
  if (!limit.ok) return fail(`尝试太频繁，请 ${Math.ceil(limit.retryAfter / 60)} 分钟后再试`, 429);

  const row = db.prepare('SELECT status FROM users WHERE id = ?').get(userId) as { status: string } | undefined;
  if (!row || row.status === 'banned' || row.status === 'deleted') return fail('账号不可用', 403);

  if (!verifyTwoFactor(userId, code)) { logActivity({ actorId: null, action: 'auth.login_failed', targetType: 'user', targetId: userId, detail: { reason: '2fa_code' } }); return fail('验证码或恢复码不对', 400); }
  consumeAuthToken(token, '2fa');
  await startSession(userId);
  logActivity({ actorId: userId, action: 'auth.login', targetType: 'user', targetId: userId, detail: { method: '2fa' } });
  return json({ ok: true });
}
