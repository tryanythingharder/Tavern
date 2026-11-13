import { fail, idParam, json, requireUser } from '@/lib/api';
import { deleteLorebook, getLorebook, updateLorebook } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const lorebook = getLorebook(user.id, id);
  return lorebook ? json({ lorebook }) : fail('世界书不存在', 404);
}

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const body = (await request.json().catch(() => ({}))) as { name?: string; entries?: unknown };
  const lorebook = updateLorebook(user.id, id, body);
  return lorebook ? json({ lorebook }) : fail('世界书不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteLorebook(user.id, id) ? json({ ok: true }) : fail('世界书不存在', 404);
}
