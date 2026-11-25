import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import db from '@/lib/db';
import { logAdmin } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { notifyFollowers } from '@/lib/follows';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/characters/[id]/status —— { status: 'published' | 'archived' }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const { id } = await context.params;
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { status?: string; reason?: string };
  const status = body.status === 'archived' ? 'archived' : 'published';
  const reason = status === 'archived' ? String(body.reason ?? '').trim().slice(0, 200) : '';
  const row = db.prepare('SELECT name, owner_id, author, hook, status FROM characters WHERE id = ? AND owner_id IS NOT NULL').get(id) as { name: string; owner_id: number; author: string; hook: string; status: string } | undefined;
  if (!row) return fail('角色不存在或不是用户作品', 404);
  db.prepare('UPDATE characters SET status = ?, review_note = ? WHERE id = ?').run(status, status === 'archived' ? reason || null : null, id);
  notify(row.owner_id, {
    type: 'system',
    title: status === 'archived' ? `作品「${row.name}」已下架` : `作品「${row.name}」已通过审核`,
    body: status === 'archived'
      ? (reason ? `下架理由：${reason}${/[。！？!?]$/.test(reason) ? '' : '。'}修改后可重新提交审核。` : '如需修改，可以继续编辑后重新提交。')
      : '现在会出现在广场与搜索里。',
    link: `/c/${id}`,
  });
  // 首次上架（待审 → 公开）才通知关注者，下架后恢复不重复打扰
  if (status === 'published' && row.status === 'pending') notifyFollowers(row.author, { id, name: row.name, hook: row.hook }, row.owner_id);
  logAdmin(user.id, status === 'archived' ? '下架角色' : '恢复角色', `${row.name} (#${id})${reason ? ` · ${reason}` : ''}`);
  return json({ ok: true, status });
}
