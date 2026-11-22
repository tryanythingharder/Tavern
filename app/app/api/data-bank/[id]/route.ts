import { fail, idParam, json, requireUser } from '@/lib/api';
import { deleteDataBankFile, getDataBankFile, updateDataBankFile } from '@/lib/data-bank';
import { checkScope } from '@/lib/data-bank-scope';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET —— 整份资料（含正文）
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  const file = id ? getDataBankFile(user.id, id) : null;
  return file ? json({ file }) : fail('资料不存在', 404);
}

// PATCH —— { name?, enabled?, content?, scope?, scopeId? }
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const body = (await request.json().catch(() => ({}))) as { name?: unknown; enabled?: unknown; content?: unknown; scope?: unknown; scopeId?: unknown };
  let scope: ReturnType<typeof checkScope> | undefined;
  if (body.scope !== undefined) {
    scope = checkScope(user.id, body.scope, body.scopeId);
    if (!scope) return fail('作用范围不对', 400);
  }
  const file = updateDataBankFile(user.id, id, {
    name: typeof body.name === 'string' ? body.name : undefined,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
    content: typeof body.content === 'string' ? body.content : undefined,
    ...(scope ? { scope: scope.scope, scopeId: scope.scopeId } : {}),
  });
  return file ? json({ file }) : fail('资料不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  return id && deleteDataBankFile(user.id, id) ? json({ ok: true }) : fail('资料不存在', 404);
}
