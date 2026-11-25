import { fail, idParam, requireUser } from '@/lib/api';
import { deleteChat, renameChat } from '@/lib/db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/chats/[id] —— 重命名会话
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);

  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { title?: unknown };
  const title = String(body.title ?? '').trim().slice(0, 60);
  if (!title) return fail('故事名称不能为空', 400);
  if (!renameChat(id, user.id, title)) return fail('会话不存在', 404);
  return Response.json({ ok: true, title });
}

// DELETE /api/chats/[id] —— 删除会话及其消息、备份
export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  if (!deleteChat(id, user.id)) return fail('会话不存在', 404);
  return Response.json({ ok: true });
}
