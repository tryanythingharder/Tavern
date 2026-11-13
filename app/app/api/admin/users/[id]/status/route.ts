import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { setUserStatus } from '@/lib/moderation';
import { logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/status —— { status: 'active' | 'banned' }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  if (id === user.id) return fail('不能封禁自己', 400);
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const status = body.status === 'banned' ? 'banned' : 'active';
  if (!setUserStatus(id, status)) return fail('用户不存在', 404);
  logAdmin(user.id, status === 'banned' ? '封禁用户' : '解封用户', `用户 #${id}`);
  return json({ ok: true });
}
