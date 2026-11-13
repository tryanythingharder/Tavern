import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { deleteComment } from '@/lib/characters';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteComment(id, user.id, isAdmin(user)) ? json({ ok: true }) : fail('只能删除自己的评论', 403);
}
