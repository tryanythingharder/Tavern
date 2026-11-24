import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { deleteComment } from '@/lib/characters';
import { commentOwner, logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const owner = commentOwner(id);
  if (!deleteComment(id, user.id, isAdmin(user))) return fail('只能删除自己的评论', 403);
  if (owner !== null && owner !== user.id) logAdmin(user.id, 'admin.comment.delete', `评论 #${id} · 用户 #${owner}`, { type: 'comment', id });
  return json({ ok: true });
}
