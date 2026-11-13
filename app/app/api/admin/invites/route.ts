import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { createInvites, inviteRequired, listInvites, setInviteRequired } from '@/lib/invite';
import { logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json({ invites: listInvites(100), required: inviteRequired() });
}

// PATCH /api/admin/invites —— { required }
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { required?: unknown };
  const required = body.required === true;
  setInviteRequired(required);
  logAdmin(user.id, required ? '开启邀请码注册' : '关闭邀请码注册', '');
  return json({ ok: true, required });
}

// POST /api/admin/invites —— { count, note }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { count?: number; note?: string };
  const invites = createInvites(user.id, Number(body.count ?? 5), String(body.note ?? ''));
  logAdmin(user.id, '生成邀请码', `${invites.length} 个`);
  return json({ invites }, 201);
}
