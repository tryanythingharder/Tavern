import { fail, json, requireUser } from '@/lib/api';
import { getAppearance, setAppearance, setHideNsfw, type ChatBackground } from '@/lib/prefs';

export const dynamic = 'force-dynamic';

// PATCH /api/me/preferences —— { hideNsfw?, fontScale?, background? }
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { hideNsfw?: unknown; fontScale?: unknown; background?: unknown };

  let touched = false;
  if (typeof body.hideNsfw === 'boolean') {
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
