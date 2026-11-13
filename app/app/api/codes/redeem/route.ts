import { fail, json, requireUser } from '@/lib/api';
import { redeemCode } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// POST /api/codes/redeem —— { code }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const result = redeemCode(user.id, body.code ?? '');
  return result.ok ? json(result) : fail(result.message, 400);
}
