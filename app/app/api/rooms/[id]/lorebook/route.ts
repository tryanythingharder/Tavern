import { fail, idParam, json, requireUser } from '@/lib/api';
import { getRoom } from '@/lib/rooms';
import { activeLorebooks, createLorebook, listLorebooks, resolvePersona, setChatLorebook } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function payload(userId: number, roomId: number) {
  const room = getRoom(roomId, userId);
  if (!room) return null;
  const persona = resolvePersona(userId, { lockedId: room.personaId, characterIds: room.characterIds });
  return {
    chatLorebookId: room.chatLorebookId,
    lorebooks: listLorebooks(userId).map((book) => ({ id: book.id, name: book.name, count: book.entries.length })),
    activeLorebooks: activeLorebooks(userId, { chatPick: null, characterIds: room.characterIds, chatLorebookId: room.chatLorebookId, persona }).map(({ book, sources }) => ({ id: book.id, name: book.name, sources })),
  };
}

// GET /api/rooms/[id]/lorebook —— 群聊世界书与生效的书
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  const data = id ? payload(user.id, id) : null;
  return data ? json(data) : fail('群聊不存在', 404);
}

// PUT { chatLorebookId: number | null } 或 { create: true }（新建一本并绑定）
export async function PUT(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  const room = id ? getRoom(id, user.id) : undefined;
  if (!id || !room) return fail('群聊不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { chatLorebookId?: unknown; create?: unknown };
  if (body.create) {
    const book = createLorebook(user.id, `群聊 · ${room.name.slice(0, 30)} #${room.id}`, []);
    setChatLorebook(user.id, 'room', id, book.id);
  } else setChatLorebook(user.id, 'room', id, Number(body.chatLorebookId) || null);
  return json({ ok: true, ...payload(user.id, id) });
}
