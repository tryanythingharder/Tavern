import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import db from '@/lib/db';
import { logAdmin } from '@/lib/audit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/role —— { role: 'admin' | 'user' }
export async function POST(request: Request, context: Params) {
  const admin = await requireUser();
  if (!admin) return fail('未登录', 401);
  if (!isAdmin(admin)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { role?: string };
  const role = body.role === 'admin' ? 'admin' : body.role === 'user' ? 'user' : null;
  if (!role) return fail('角色不对', 400);
  if (id === admin.id && role !== 'admin') return fail('不能取消自己的管理员权限', 400);

  const target = db.prepare('SELECT id, nickname, role FROM users WHERE id = ?').get(id) as { id: number; nickname: string; role: string } | undefined;
  if (!target) return fail('用户不存在', 404);
  if (role === 'user' && target.role === 'admin') {
    const admins = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as { count: number }).count;
    if (admins <= 1) return fail('至少需要保留一个管理员', 400);
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  logAdmin(admin.id, role === 'admin' ? '设为管理员' : '取消管理员', `用户 #${id} ${target.nickname}`);
  return json({ ok: true, role });
}
