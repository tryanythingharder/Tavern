import { fail, json } from '@/lib/api';
import { revokeAllSessions, updatePassword } from '@/lib/auth';
import { consumeAuthToken } from '@/lib/auth-tokens';

export const dynamic = 'force-dynamic';

// POST /api/auth/reset —— { token, password }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = String(body.token ?? '');
  const password = String(body.password ?? '');
  if (password.length < 8) return fail('新密码至少 8 位', 400);
  const userId = consumeAuthToken(token, 'reset');
  if (!userId) return fail('链接无效或已过期，请重新申请', 400);
  updatePassword(userId, password);
  // 重置后让所有旧会话失效
  revokeAllSessions(userId);
  return json({ ok: true });
}
