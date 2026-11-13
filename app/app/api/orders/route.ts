import { fail, json, requireUser } from '@/lib/api';
import { checkoutLink, createOrder, listOrders, pricePerPointCents } from '@/lib/billing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ orders: listOrders(user.id), pricePerPointCents: pricePerPointCents() });
}

// POST /api/orders —— { points } 创建待支付订单（价格由服务端按单价算）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { points?: number };
  const points = Number(body.points);
  if (!Number.isFinite(points) || points < 10 || points > 100000) return fail('充值点数要在 10 到 100000 之间', 400);
  const unit = pricePerPointCents();
  const order = createOrder(user.id, points, Math.round(points) * unit);
  return json({ order, pricePerPointCents: unit, payUrl: checkoutLink(order) }, 201);
}
