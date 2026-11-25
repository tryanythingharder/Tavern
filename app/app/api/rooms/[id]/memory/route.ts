import { fail, idParam, json, requireUser } from '@/lib/api';
import { roomMemorySettings, roomSummarizeNow, updateRoomMemory, type RoomMemoryPatch } from '@/lib/room-memory';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET 群聊作者注释与记忆摘要设置
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const settings = roomMemorySettings(id, user.id);
  return settings ? json(settings) : fail('房间不存在', 404);
}

// PATCH { note?, prefs?, summaryText? }
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as RoomMemoryPatch;
  const patch: RoomMemoryPatch = {};
  if (body.note && typeof body.note === 'object') patch.note = body.note;
  if (body.prefs && typeof body.prefs === 'object') patch.prefs = body.prefs;
  if (typeof body.summaryText === 'string') patch.summaryText = body.summaryText;
  if (!updateRoomMemory(id, user.id, patch)) return fail('房间不存在', 404);
  return json(roomMemorySettings(id, user.id));
}

// POST —— 立即刷新摘要
export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const result = await roomSummarizeNow(id, user.id);
  const settings = roomMemorySettings(id, user.id);
  if (result.error && result.error === '房间不存在') return fail(result.error, 404);
  return json({ ...settings, error: result.error });
}
