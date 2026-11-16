import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSetting } from '@/lib/settings';
import type { PaymentProvider, WebhookResult } from '@/lib/payments/types';

// 通用托管结算页：任何能「带参数跳转 + HMAC 回调」的网关都能接。
// 跳转参数：orderId / points / amount（分）/ currency / expires（Unix 秒）/ token
//   token = HMAC-SHA256(checkoutSecret, `${orderId}|${points}|${amount}|${expires}`)
// 回调 POST /api/payments/hosted（旧地址 /api/payments/webhook 仍可用）
//   body: { orderId, amount, currency, status: 'paid', timestamp, signature }
//   signature = HMAC-SHA256(payment.secret, `${orderId}|${amount}|${currency}|${status}|${timestamp}`)
const MAX_SKEW_SECONDS = 10 * 60;

function webhookSecret(): string {
  return getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? '');
}

function checkoutUrl(): string {
  return getSetting('payment.checkoutUrl', process.env.TAVERN_PAYMENT_CHECKOUT_URL ?? '');
}

// 结算页令牌使用独立派生密钥，绝不把 webhook 密钥的签名交给浏览器。
function checkoutSecret(): string {
  const explicit = getSetting('payment.checkoutSecret', process.env.TAVERN_PAYMENT_CHECKOUT_SECRET ?? '');
  if (explicit) return explicit;
  const secret = webhookSecret();
  return secret ? createHmac('sha256', secret).update('checkout').digest('hex') : '';
}

export const hostedProvider: PaymentProvider = {
  id: 'hosted',
  label: '通用结算页（HMAC）',
  configHint: '结算页 URL + 回调密钥（TAVERN_PAYMENT_CHECKOUT_URL / TAVERN_PAYMENT_SECRET）',
  configured: () => Boolean(checkoutUrl() && webhookSecret()),
  async createCheckout(order, ctx) {
    const base = checkoutUrl();
    if (!base) return null;
    try {
      const url = new URL(base);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      const expires = Math.floor(Date.now() / 1000) + 30 * 60;
      url.searchParams.set('orderId', String(order.id));
      url.searchParams.set('points', String(order.points));
      url.searchParams.set('amount', String(order.priceCents));
      url.searchParams.set('currency', ctx.currency);
      url.searchParams.set('expires', String(expires));
      url.searchParams.set('return', `${ctx.siteUrl}/me/points?paid=${order.id}`);
      const secret = checkoutSecret();
      if (secret) url.searchParams.set('token', createHmac('sha256', secret).update(`${order.id}|${order.points}|${order.priceCents}|${expires}`).digest('hex'));
      return url.toString();
    } catch {
      return null;
    }
  },
  async parseWebhook(request): Promise<WebhookResult> {
    const secret = webhookSecret();
    if (!secret) return { kind: 'error', status: 503, message: '回调密钥未配置' };
    const body = (await request.json().catch(() => ({}))) as { orderId?: number; amount?: number; currency?: string; status?: string; timestamp?: number; signature?: string };
    const orderId = Number(body.orderId);
    const amount = Math.round(Number(body.amount));
    const currency = String(body.currency ?? '').toUpperCase();
    const status = String(body.status ?? '').toLowerCase();
    const timestamp = Number(body.timestamp);
    const signature = String(body.signature ?? '').toLowerCase();
    if (!Number.isInteger(orderId) || orderId <= 0 || !Number.isFinite(amount) || !currency) return { kind: 'error', status: 400, message: '回调参数不对' };
    if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SKEW_SECONDS) return { kind: 'error', status: 400, message: '回调已过期' };
    const expected = Buffer.from(createHmac('sha256', secret).update(`${orderId}|${amount}|${currency}|${status}|${timestamp}`).digest('hex'));
    const got = Buffer.from(signature);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return { kind: 'error', status: 401, message: '签名不对' };
    if (status !== 'paid') return { kind: 'ignore', reason: status };
    return { kind: 'paid', orderId, amountCents: amount, currency, reference: String(timestamp) };
  },
};
