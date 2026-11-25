import { fail, idParam, json, requireUser } from '@/lib/api';
import { moderateText } from '@/lib/auto-moderation';
import { deleteRoomMessage, editRoomMessage, getRoom, getRoomMessage, selectRoomCandidate, setRoomMessageReasoning } from '@/lib/rooms';
import { busyGuard } from '@/lib/gen-lock';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; messageId: string }> };

async function load(context: Params) {
  const user = await requireUser();
  if (!user) return { error: fail('未登录', 401) };
  const { id, messageId } = await context.params;
  const roomId = idParam(id);
  const mid = idParam(messageId);
  if (!roomId || !mid) return { error: fail('参数不对', 400) };
  const room = getRoom(roomId, user.id);
  if (!room) return { error: fail('房间不存在', 404) };
  const message = getRoomMessage(room.id, mid);
  if (!message) return { error: fail('消息不存在', 404) };
  return { room, message };
}

// PATCH /api/rooms/[id]/messages/[messageId] —— { content } 编辑当前版本 | { selected } 切换候选（ST swipe）
export async function PATCH(request: Request, context: Params) {
  const loaded = await load(context);
  if ('error' in loaded) return loaded.error;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { content?: unknown; selected?: unknown; reasoning?: unknown };
  const busy = busyGuard(`room:${loaded.room.id}`);
  if (busy) return busy;
  if (typeof body.selected === 'number') {
    const updated = selectRoomCandidate(loaded.message.id, Math.floor(body.selected));
    return updated ? json({ message: updated }) : fail('没有这个版本', 400);
  }
  if (typeof body.content === 'string') {
    const content = body.content.trim();
    if (!content) return fail('内容不能为空', 400);
    if (loaded.message.role === 'user') {
      const verdict = await moderateText(content);
      if (!verdict.ok) return fail(verdict.message, 422);
    }
    editRoomMessage(loaded.message.id, content.slice(0, 20000));
    // 思考内容：只改当前候选；空串 = 删除；不传 = 不动
    if (loaded.message.role !== 'user' && (typeof body.reasoning === 'string' || body.reasoning === null)) {
      const text = String(body.reasoning ?? '').replace(/\s+$/, '');
      const prev = loaded.message.thought;
      setRoomMessageReasoning(loaded.message.id, loaded.message.selected ?? 0, text.trim() ? { t: text, ms: prev?.ms ?? 0 } : null);
    }
    return json({ message: getRoomMessage(loaded.room.id, loaded.message.id) });
  }
  return fail('没有要改的内容', 400);
}

// DELETE /api/rooms/[id]/messages/[messageId] —— 删除这一条（ST 删除消息，不动后面的楼层）
export async function DELETE(_request: Request, context: Params) {
  const loaded = await load(context);
  if ('error' in loaded) return loaded.error;
  const busy = busyGuard(`room:${loaded.room.id}`);
  if (busy) return busy;
  deleteRoomMessage(loaded.message.id);
  return json({ ok: true });
}
