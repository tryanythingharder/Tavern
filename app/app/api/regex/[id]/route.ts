import { fail, idParam, json, requireUser } from '@/lib/api';
import { deleteRegexRule, updateRegexRule } from '@/lib/resources-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  const rule = updateRegexRule(user.id, id, body);
  return rule ? json({ rule }) : fail('规则不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteRegexRule(user.id, id) ? json({ ok: true }) : fail('规则不存在', 404);
}
