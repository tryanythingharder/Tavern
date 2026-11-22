import { createHmac, timingSafeEqual } from 'node:crypto';
import { serviceValue } from '@/lib/service-config';
import type { Order } from '@/lib/billing';
import type { PaymentProvider, WebhookResult } from '@/lib/payments/types';

// Stripe Checkout（零依赖，直接调 REST）。配置 TAVERN_STRIPE_SECRET_KEY + TAVERN_STRIPE_WEBHOOK_SECRET 即启用，
// Webhook 地址：/api/payments/stripe，订阅 checkout.session.completed。
function stripeKey(): string {
  return serviceValue('payment.stripeKey');
}

function stripeWebhookSecret(): string {
  return serviceValue('payment.stripeWebhookSecret');
}

function stripeEnabled(): boolean {
  return Boolean(stripeKey() && stripeWebhookSecret());
}

async function stripeCheckout(order: Order, currency: string, site: string, email?: string): Promise<string | null> {
  const key = stripeKey();
  if (!key) return null;
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', `${site}/me/points?paid=${order.id}`);
  form.set('cancel_url', `${site}/me/points?cancelled=${order.id}`);
  form.set('client_reference_id', String(order.id));
  form.set('metadata[orderId]', String(order.id));
  form.set('payment_intent_data[metadata][orderId]', String(order.id));
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', currency.toLowerCase());
  form.set('line_items[0][price_data][unit_amount]', String(order.priceCents));
  form.set('line_items[0][price_data][product_data][name]', `${order.points} points`);
  if (email) form.set('customer_email', email);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `tavern-order-${order.id}` },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) throw new Error(data.error?.message || `Stripe ${res.status}`);
  return data.url;
}

// 校验 Stripe-Signature: t=...,v1=...；签名内容 `${t}.${rawBody}`，容忍 5 分钟时差。
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header || !secret) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = v;
    else if (k === 'v1' && v) sigs.push(v);
  }
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex'));
  return sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

export const stripeProvider: PaymentProvider = {
  id: 'stripe',
  label: 'Stripe Checkout',
  configHint: '在「站点与服务 → Stripe 收款」填写，或用 TAVERN_STRIPE_* 环境变量；webhook 订阅 checkout.session.completed',
  configured: stripeEnabled,
  createCheckout: (order, ctx) => stripeCheckout(order, ctx.currency, ctx.siteUrl, ctx.email),
  async parseWebhook(request): Promise<WebhookResult> {
    const secret = stripeWebhookSecret();
    if (!secret) return { kind: 'error', status: 503, message: 'Stripe 未配置' };
    const raw = await request.text();
    if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'), secret)) return { kind: 'error', status: 401, message: '签名不对' };
    const event = JSON.parse(raw) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') return { kind: 'ignore', reason: String(event.type) };
    const session = (event.data?.object ?? {}) as { id?: string; client_reference_id?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { orderId?: string } };
    if (session.payment_status !== 'paid') return { kind: 'ignore', reason: 'unpaid' };
    return {
      kind: 'paid',
      orderId: Number(session.metadata?.orderId ?? session.client_reference_id),
      amountCents: Number(session.amount_total),
      currency: String(session.currency ?? '').toUpperCase(),
      reference: String(session.id ?? event.id ?? ''),
    };
  },
};
