import { fail, json, requireUser } from '@/lib/api';
import { STATE_MESSAGE, nsfwAccess } from '@/lib/age-gate';
import { getAppearance, setAppearance, setHideNsfw, type ChatBackground } from '@/lib/prefs';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// PATCH /api/me/preferences —— { hideNsfw?, fontScale?, background? }
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { hideNsfw?: unknown; fontScale?: unknown; background?: unknown };

  let touched = false;
  if (typeof body.hideNsfw === 'boolean') {
    // 打开显示 18+ 前先过年龄/地区检查（关掉随时可以）
    if (!body.hideNsfw) {
      const access = await nsfwAccess(user.id);
      if (!access.allowed) return Response.json({ message: STATE_MESSAGE[access.state], state: access.state }, { status: 403 });
    }
    setHideNsfw(user.id, body.hideNsfw);
    touched = true;
  }
  const fontScale = Number(body.fontScale);
  const background = body.background;
  const hasFont = Number.isFinite(fontScale) && fontScale >= 85 && fontScale <= 120;
  const hasBg = background === 'default' || background === 'warm';
  if (hasFont || hasBg) {
    setAppearance(user.id, {
      ...(hasFont ? { fontScale } : {}),
      ...(hasBg ? { background: background as ChatBackground } : {}),
    });
    touched = true;
  }
  if (!touched) return fail('参数不对', 400);

  return json({ ok: true, appearance: getAppearance(user.id) });
}
