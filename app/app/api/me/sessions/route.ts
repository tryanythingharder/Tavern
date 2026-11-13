import { fail, json, requireUser } from '@/lib/api';
import { currentSessionToken, listSessions, revokeOtherSessions, revokeSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/sessions
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ sessions: await listSessions(user.id) });
}

// POST /api/me/sessions —— { token } 移除单个；{ others: true } 退出其他设备
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { token?: unknown; others?: unknown };

  if (body.others === true) {
    const removed = revokeOtherSessions(user.id, await currentSessionToken());
    return json({ ok: true, removed });
  }
  const token = String(body.token ?? '');
  if (!token) return fail('缺少会话', 400);
  const removed = revokeSession(user.id, token);
  return json({ ok: true, removed });
}
