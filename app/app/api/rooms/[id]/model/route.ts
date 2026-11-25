import { fail, idParam, json, requireUser } from '@/lib/api';
import db from '@/lib/db';
import { availableModels } from '@/lib/model';
import { getRoom } from '@/lib/rooms';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/rooms/[id]/model —— 群聊房间当前模型 + 可选模型（含每千 tokens 点数）
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const room = getRoom(id, user.id);
  if (!room) return fail('房间不存在', 404);
  return json({ model: room.model ?? '', models: availableModels() });
}

// PATCH /api/rooms/[id]/model —— { model }，空字符串 = 跟随默认
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const room = getRoom(id, user.id);
  if (!room) return fail('房间不存在', 404);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { model?: string | null };
  const wanted = String(body.model ?? '').trim();
  if (wanted && !availableModels().some((item) => item.id === wanted)) return fail('这个模型目前不可用', 400);
  db.prepare('UPDATE rooms SET model = ? WHERE id = ? AND user_id = ?').run(wanted || null, id, user.id);
  return json({ ok: true, model: wanted });
}
