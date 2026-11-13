import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { refundOrder } from '@/lib/billing';
import { logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/orders/[id]/refund —— 退款并扣回点数
export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const result = refundOrder(id);
  if (result.ok) logAdmin(user.id, '订单退款', `订单 #${id}${result.points ? ` · ${result.points} 点` : ''}`);
  return result.ok ? json(result) : fail(result.message, 400);
}
