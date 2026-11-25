import { fail, json, requireUser } from '@/lib/api';
import { getUiPrefs, mergeUiPrefs } from '@/lib/ui-prefs';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/me/prefs —— 账号里的界面偏好
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ prefs: getUiPrefs(user.id) });
}

// PATCH /api/me/prefs —— { lang?, theme?, mode?, appearance? }，未登录时浏览器只存 cookie
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, null);
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('参数不对', 400);
  return json({ ok: true, prefs: mergeUiPrefs(user.id, body) });
}
