import { fail, json, requireUser } from '@/lib/api';
import { getGenPrefs, setGenPrefs } from '@/lib/gen-prefs';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/me/gen-prefs —— ST 的全局生成行为设置
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ prefs: getGenPrefs(user.id) });
}

// PATCH /api/me/gen-prefs —— 部分更新：{ stopStrings?, stopMacros?, trimSentences?, autoContinue?: {enabled?, target?}, reasoning?: {...} }
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, null);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('参数不对', 400);
  if (typeof body.stopStrings === 'string' && body.stopStrings.trim().startsWith('[')) {
    try {
      JSON.parse(body.stopStrings);
    } catch {
      return fail('停止词要写成 JSON 数组，例如 ["\\n{{user}}:"]', 400);
    }
  }
  return json({ ok: true, prefs: setGenPrefs(user.id, body) });
}
