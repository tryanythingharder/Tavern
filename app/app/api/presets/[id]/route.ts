import { fail, idParam, json, requireUser } from '@/lib/api';
import { deletePreset, getPreset, updatePreset } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const preset = getPreset(user.id, id);
  return preset ? json({ preset }) : fail('预设不存在', 404);
}

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const preset = updatePreset(user.id, id, body);
  return preset ? json({ preset }) : fail('预设不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deletePreset(user.id, id) ? json({ ok: true }) : fail('预设不存在', 404);
}
