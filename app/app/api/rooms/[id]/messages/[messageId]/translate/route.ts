import { fail, idParam, json, requireUser } from '@/lib/api';
import { canGenerate } from '@/lib/auth';
import { getGenPrefs } from '@/lib/gen-prefs';
import { getRoom, getRoomMessage, saveRoomTranslation } from '@/lib/rooms';
import { translateText } from '@/lib/translate';
import { checkQuota } from '@/lib/usage';
import { ensureStartingPoints } from '@/lib/points';

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
  return { user, room, message };
}

// POST /api/rooms/[id]/messages/[messageId]/translate —— 群聊消息翻译（同单聊 /api/messages/[id]/translate）
//   body: { lang? }，默认「生成行为」里的目标语言；用房间当前模型，按模型价格扣点
export async function POST(request: Request, context: Params) {
  const loaded = await load(context);
  if ('error' in loaded) return loaded.error;
  const { user, room, message } = loaded;
  if (!canGenerate(user)) return fail('请先验证邮箱后再使用', 403);
  const body = (await request.json().catch(() => ({}))) as { lang?: unknown };
  const lang = typeof body.lang === 'string' && body.lang ? body.lang : getGenPrefs(user.id).translate.target;
  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  const result = await translateText(user.id, message.content, lang, { model: room.model, ref: `translate:room:${message.id}` });
  if (!result.ok) return fail(result.error, result.status);
  const translation = saveRoomTranslation(message.id, { lang, text: result.text });
  return json({ translation, cost: result.cost, free: result.free, balance: result.balance });
}

// DELETE —— 删掉当前正文的译文
export async function DELETE(_request: Request, context: Params) {
  const loaded = await load(context);
  if ('error' in loaded) return loaded.error;
  saveRoomTranslation(loaded.message.id, null);
  return json({ translation: null });
}
