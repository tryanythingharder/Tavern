import { fail, json } from '@/lib/api';
import { markOrderPaid, orderForWebhook, paymentCurrency } from '@/lib/billing';
import { findProvider } from '@/lib/payments';
import { logActivity, orderOwner } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/payments/<provider> —— 各支付渠道的服务端回调。
// 渠道插件只验签和解析；订单存在、金额、币种与幂等到账在这里统一校验。
// /api/payments/webhook 是旧地址，等同 hosted。
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await context.params;
  const provider = findProvider(raw === 'webhook' ? 'hosted' : raw);
  if (!provider?.parseWebhook) return fail('未知支付渠道', 404);

  const result = await provider.parseWebhook(request);
  if (result.kind === 'error') return fail(result.message, result.status);
  if (result.kind === 'ignore') return json({ ok: true, ignored: result.reason });

  const order = Number.isInteger(result.orderId) && result.orderId > 0 ? orderForWebhook(result.orderId) : undefined;
  if (!order) return fail('订单不存在', 404);
  if (order.priceCents !== Math.round(result.amountCents)) return fail('支付金额与订单不一致', 400);
  if (paymentCurrency().toUpperCase() !== result.currency.toUpperCase()) return fail('支付币种与订单不一致', 400);

  const paid = markOrderPaid(result.orderId, `${provider.id}:${result.reference}`);
  if (paid.ok) logActivity({ actorId: orderOwner(result.orderId), actorRole: 'system', action: 'points.purchase', targetType: 'order', targetId: result.orderId, detail: { provider: provider.id, points: paid.points ?? 0 }, ip: '', userAgent: '' });
  return paid.ok ? json(paid) : fail(paid.message, 400);
}
