import { fail, json, requireUser } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { currentSessionToken, getPasswordHash, revokeOtherSessions, updatePassword, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/me/password —— { current, next }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  const current = String(body.current ?? '');
  const next = String(body.next ?? '');
  if (next.length < 8) return fail('新密码至少 8 位', 400);
  if (next === current) return fail('新密码不能和当前密码相同', 400);
  const stored = getPasswordHash(user.id);
  if (!stored || !verifyPassword(current, stored)) return fail('当前密码不对', 400);
  updatePassword(user.id, next);
  logActivity({ actorId: user.id, action: 'auth.password_change', targetType: 'user', targetId: user.id });
  // 改密后让其他设备下线，当前设备保留
  revokeOtherSessions(user.id, await currentSessionToken());
  return json({ ok: true });
}
