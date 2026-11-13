import { fail, idParam, json, requireUser } from '@/lib/api';
import { deleteRoom, getRoom, updateRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const room = getRoom(id, user.id);
  return room ? json({ room }) : fail('房间不存在', 404);
}

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const room = updateRoom(user.id, id, body);
  return room ? json({ room }) : fail('房间不存在或成员为空', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteRoom(user.id, id) ? json({ ok: true }) : fail('房间不存在', 404);
}
