import { fail, json, requireUser } from '@/lib/api';
import { STATE_MESSAGE, getAgeRecord, nsfwAccess, setBirthDate } from '@/lib/age-gate';
import { setHideNsfw } from '@/lib/prefs';
import { activeProvider } from '@/lib/age-verify';
import { rateLimit } from '@/lib/rate-limit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

async function payload(userId: number | null) {
  const access = await nsfwAccess(userId);
  const record = userId ? getAgeRecord(userId) : null;
  return {
    ...access,
    message: STATE_MESSAGE[access.state],
    hasBirthDate: Boolean(record?.birthDate),
    verified: Boolean(record?.verifiedAt),
    canVerify: Boolean(activeProvider()),
  };
}

// GET /api/me/age —— 当前账号、当前地区能不能看 18+
export async function GET() {
  const user = await requireUser();
  return json(await payload(user?.id ?? null));
}

// POST /api/me/age { birthDate: 'YYYY-MM-DD', show?: boolean } —— 填出生日期（只能填一次）；show=true 时顺便打开显示 18+
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!rateLimit('age-dob', [String(user.id)], 10, 60 * 60 * 1000).ok) return fail('操作太频繁，稍后再试', 429);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { birthDate?: unknown; show?: unknown };
  if (typeof body.birthDate === 'string' && body.birthDate) {
    const result = setBirthDate(user.id, body.birthDate.trim());
    if (!result.ok) return fail(result.error, 400);
  }
  const access = await nsfwAccess(user.id);
  if (body.show === true && access.allowed) setHideNsfw(user.id, false);
  return json(await payload(user.id));
}
