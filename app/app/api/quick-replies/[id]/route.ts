import { fail, idParam, json, requireUser } from '@/lib/api';
import { deleteQuickReply } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteQuickReply(user.id, id) ? json({ ok: true }) : fail('快捷回复不存在', 404);
}
