import { fail, idParam, json, requireUser } from '@/lib/api';
import { getRoom } from '@/lib/rooms';
import { personaSender, resolvePersona, setRoomPersona } from '@/lib/resources-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PUT /api/rooms/[id]/persona { personaId: number | null } —— 群聊里锁定身份；null = 绑定任一成员的身份 → 默认身份
export async function PUT(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const roomId = idParam((await context.params).id);
  if (!roomId) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { personaId?: unknown };
  const personaId = body.personaId === null ? null : Number(body.personaId) || null;
  if (!setRoomPersona(user.id, roomId, personaId)) return fail('房间不存在', 404);
  const room = getRoom(roomId, user.id)!;
  const persona = resolvePersona(user.id, { lockedId: room.personaId, characterIds: room.characterIds });
  return json({ locked: room.personaId, persona: persona ? { id: persona.id, ...personaSender(user.id, persona) } : { id: null, ...personaSender(user.id, null) } });
}
