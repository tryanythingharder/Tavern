import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSetting } from '@/lib/settings';
import type { Order } from '@/lib/billing';

// Stripe Checkout（零依赖，直接调 REST）。配置 TAVERN_STRIPE_SECRET_KEY + TAVERN_STRIPE_WEBHOOK_SECRET 即启用，
// 优先于通用托管结算页。Webhook 地址：/api/payments/stripe，订阅 checkout.session.completed。
export function stripeKey(): string {
  return getSetting('payment.stripeKey', process.env.TAVERN_STRIPE_SECRET_KEY ?? '');
}

export function stripeWebhookSecret(): string {
  return getSetting('payment.stripeWebhookSecret', process.env.TAVERN_STRIPE_WEBHOOK_SECRET ?? '');
}

export function stripeEnabled(): boolean {
  return Boolean(stripeKey() && stripeWebhookSecret());
}

export async function stripeCheckout(order: Order, currency: string, site: string, email?: string): Promise<string | null> {
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
