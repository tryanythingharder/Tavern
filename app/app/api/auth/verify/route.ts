import { fail, json } from '@/lib/api';
import { markEmailVerified } from '@/lib/auth';
import { consumeAuthToken } from '@/lib/auth-tokens';
import { jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify —— { token }
export async function POST(request: Request) {
  // 未登录可调：请求体只会是几个短字段，先限 16KB 再读
  const parsed = await jsonOr413(request, 16 * 1024, {});
  if (parsed instanceof Response) return parsed;
  const body = (parsed ?? {}) as { token?: unknown };
  const userId = consumeAuthToken(String(body.token ?? ''), 'verify');
  if (!userId) return fail('链接无效或已过期，请在「我的」里重新发送验证邮件', 400);
  markEmailVerified(userId);
  return json({ ok: true });
}
