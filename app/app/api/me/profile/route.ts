import { fail, json, requireUser } from '@/lib/api';
import { updateAuthorBio, updateNickname } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PATCH /api/me/profile —— { nickname?, bio? }
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { nickname?: unknown; bio?: unknown };

  let touched = false;
  if (body.nickname !== undefined) {
    const nickname = String(body.nickname).replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!nickname) return fail('昵称不能为空', 400);
    updateNickname(user.id, nickname);
    touched = true;
  }
  if (body.bio !== undefined) {
    updateAuthorBio(user.id, String(body.bio));
    touched = true;
  }
  if (!touched) return fail('参数不对', 400);

  return json({ ok: true });
}
