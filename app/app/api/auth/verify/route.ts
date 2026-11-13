import { fail, json } from '@/lib/api';
import { markEmailVerified } from '@/lib/auth';
import { consumeAuthToken } from '@/lib/auth-tokens';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify —— { token }
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const userId = consumeAuthToken(String(body.token ?? ''), 'verify');
  if (!userId) return fail('链接无效或已过期，请在「我的」里重新发送验证邮件', 400);
  markEmailVerified(userId);
  return json({ ok: true });
}
