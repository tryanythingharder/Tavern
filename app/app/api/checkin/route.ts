import { fail, json, requireUser } from '@/lib/api';
import { checkinStatus, claimCheckin } from '@/lib/checkin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json(checkinStatus(user.id));
}

// POST /api/checkin —— 领取今天的签到点数
export async function POST() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const result = claimCheckin(user.id);
  return result.ok ? json(result) : fail(result.message, 400);
}
