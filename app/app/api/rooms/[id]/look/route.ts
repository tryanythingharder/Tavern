import { getCurrentUser } from '@/lib/auth';
import { setCharacterLook } from '@/lib/db';
import { getRoom, getRoomMessage } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return Response.json({ message }, { status });
}

// PUT /api/rooms/[id]/look { messageId } —— 把群聊里画给某位成员的插图设为 TA 的定妆照（和单聊共用，按「玩家 × 角色」存）
// DELETE ?characterId= —— 取消这位成员的定妆照
export async function PUT(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return fail('房间不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { messageId?: number };
  const message = getRoomMessage(room.id, Number(body.messageId));
  if (!message) return fail('消息不存在', 404);
  const url = message.attachment?.kind === 'image' && /^\/media\/[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(message.attachment.url) ? message.attachment.url : '';
  if (!url || !message.speakerId || !room.characterIds.includes(message.speakerId)) return fail('只有群聊里生成的插图能设为定妆照', 400);
  setCharacterLook(user.id, message.speakerId, url);
  return Response.json({ characterId: message.speakerId, lookUrl: url });
}

export async function DELETE(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return fail('房间不存在', 404);
  const characterId = new URL(request.url).searchParams.get('characterId') ?? '';
  if (!room.characterIds.includes(characterId)) return fail('不是这个房间的成员', 400);
  setCharacterLook(user.id, characterId, null);
  return Response.json({ characterId, lookUrl: null });
}
