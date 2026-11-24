import { fail, idParam, json, requireUser } from '@/lib/api';
import { branchRoom, getRoom, roomFamily } from '@/lib/rooms';
import { busyGuard } from '@/lib/gen-lock';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/rooms/[id]/branch —— { parent, children }
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  const room = id ? getRoom(id, user.id) : undefined;
  if (!room) return fail('房间不存在', 404);
  return json(roomFamily(user.id, room));
}

// POST /api/rooms/[id]/branch —— { messageId, checkpoint? } 从某条消息分出新房间（ST 群聊分支/检查点）
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  if (!getRoom(id, user.id)) return fail('房间或消息不存在', 404);
  const busy = busyGuard(`room:${id}`);
  if (busy) return busy;
  const body = (await request.json().catch(() => ({}))) as { messageId?: unknown; checkpoint?: unknown };
  const room = branchRoom(user.id, id, Number(body.messageId), body.checkpoint === true);
  return room ? json({ room }) : fail('房间或消息不存在', 404);
}
