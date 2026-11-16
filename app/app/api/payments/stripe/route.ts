import { fail, json } from '@/lib/api';
import { markOrderPaid, orderForWebhook, paymentCurrency } from '@/lib/billing';
import { stripeWebhookSecret, verifyStripeSignature } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// POST /api/payments/stripe —— Stripe webhook（checkout.session.completed）
export async function POST(request: Request) {
  const secret = stripeWebhookSecret();
  if (!secret) return fail('Stripe 未配置', 503);
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) return fail('签名不对', 401);

  const event = JSON.parse(raw) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return json({ ok: true, ignored: event.type });
  }
  const session = (event.data?.object ?? {}) as {
    id?: string; client_reference_id?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { orderId?: string };
  };
  if (session.payment_status !== 'paid') return json({ ok: true, pending: true });
  const orderId = Number(session.metadata?.orderId ?? session.client_reference_id);
  const order = Number.isInteger(orderId) ? orderForWebhook(orderId) : undefined;
  if (!order) return fail('订单不存在', 404);
  if (Number(session.amount_total) !== order.priceCents) return fail('支付金额与订单不一致', 400);
  if (String(session.currency ?? '').toUpperCase() !== paymentCurrency().toUpperCase()) return fail('支付币种与订单不一致', 400);
  const result = markOrderPaid(orderId, `stripe:${session.id ?? event.id ?? ''}`);
  return result.ok ? json(result) : fail(result.message, 400);
}
