import { fail, json, requireUser } from '@/lib/api';
import { deleteTag, updateTag } from '@/lib/char-tags';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/tags/[id] —— { name?, color?, folder?, sort? }
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  const tag = updateTag(user.id, Number(id), body);
  if (!tag) return fail('标签不存在', 404);
  if ('error' in tag) return fail(tag.error, 400);
  return json({ tag });
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  if (!deleteTag(user.id, Number(id))) return fail('标签不存在', 404);
  return json({ ok: true });
}
