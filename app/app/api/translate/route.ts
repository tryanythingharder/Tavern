import { fail, json } from '@/lib/api';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { getChat } from '@/lib/db';
import { getGenPrefs } from '@/lib/gen-prefs';
import { translateText } from '@/lib/translate';
import { checkQuota } from '@/lib/usage';
import { ensureStartingPoints } from '@/lib/points';

export const dynamic = 'force-dynamic';

// POST /api/translate —— 翻译一段文字（输入框「翻译输入」用，ST 的 translate inputs）
//   body: { text, lang?（默认「发给模型的语言」）, chatId?（用这个会话的模型） }
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再使用', 403);
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; lang?: unknown; chatId?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim()) return fail('没有可翻译的内容', 400);
  const lang = typeof body.lang === 'string' && body.lang ? body.lang : getGenPrefs(user.id).translate.modelLang;
  const chat = typeof body.chatId === 'number' ? getChat(body.chatId, user.id) : undefined;
  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  const result = await translateText(user.id, body.text, lang, { model: chat?.model ?? null });
  if (!result.ok) return fail(result.error, result.status);
  return json({ text: result.text, lang, cost: result.cost, free: result.free, balance: result.balance });
}
