import { fail, json, requireUser } from '@/lib/api';
import { createOrder, listOrders, paymentCurrency, pricePerPointCents } from '@/lib/billing';
import { siteUrl } from '@/lib/mail';
import { activeProvider } from '@/lib/payments';

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
  let payUrl: string | null = null;
  try {
    payUrl = await activeProvider().createCheckout(order, { siteUrl: siteUrl(request), currency: paymentCurrency(), email: user.email });
  } catch (error) {
    return fail(`支付暂不可用：${(error as Error).message}`, 502);
  }
  return json({ order, pricePerPointCents: unit, payUrl }, 201);
}
