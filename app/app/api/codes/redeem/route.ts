import { fail, json, requireUser } from '@/lib/api';
import { redeemCode } from '@/lib/billing';
import { last4, logActivity } from '@/lib/audit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/codes/redeem —— { code }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { code?: string };
  const result = redeemCode(user.id, body.code ?? '');
  logActivity({ actorId: user.id, action: 'points.redeem_code', targetType: 'code', targetId: last4(String(body.code ?? '').toUpperCase()), detail: { ok: result.ok, amount: result.amount ?? 0 } });
  return result.ok ? json(result) : fail(result.message, 400);
}
