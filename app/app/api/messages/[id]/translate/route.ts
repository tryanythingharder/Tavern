import { fail, json } from '@/lib/api';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { getChat, getOwnedMessage } from '@/lib/db';
import { getGenPrefs } from '@/lib/gen-prefs';
import { saveTranslation, translateText } from '@/lib/translate';
import { checkQuota } from '@/lib/usage';
import { ensureStartingPoints } from '@/lib/points';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/messages/[id]/translate —— 把当前正文翻成目标语言（默认用「生成行为」里的目标语言），存起来
//   body: { lang? }
export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再使用', 403);
  const message = getOwnedMessage(Number((await context.params).id), user.id);
  if (!message) return fail('消息不存在', 404);
  const chat = getChat(message.chat_id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { lang?: unknown };
  const lang = typeof body.lang === 'string' && body.lang ? body.lang : getGenPrefs(user.id).translate.target;
  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  const result = await translateText(user.id, message.content, lang, { model: chat.model, ref: `translate:${message.id}` });
  if (!result.ok) return fail(result.error, result.status);
  const translation = saveTranslation(message, { lang, text: result.text });
  return json({ translation, cost: result.cost, free: result.free, balance: result.balance });
}

// DELETE —— 删掉当前正文的译文（回到原文）
export async function DELETE(_request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const message = getOwnedMessage(Number((await context.params).id), user.id);
  if (!message) return fail('消息不存在', 404);
  saveTranslation(message, null);
  return json({ translation: null });
}
