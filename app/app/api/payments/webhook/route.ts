import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail, json } from '@/lib/api';
import { markOrderPaid, orderForWebhook, paymentCurrency } from '@/lib/billing';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const MAX_SKEW_SECONDS = 10 * 60;

// POST /api/payments/webhook —— 支付网关服务端回调
// 约定 body: { orderId, amount, currency, status, timestamp, signature }
// canonical = `${orderId}|${amount}|${currency}|${status}|${timestamp}`
// signature = HMAC-SHA256(payment.secret, canonical) 的十六进制。
// 验签之外还校验金额、币种、状态与时间窗，避免客户端伪造或重放回调。
export async function POST(request: Request) {
  const secret = getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? '');
  if (!secret) return fail('支付回调未配置（TAVERN_PAYMENT_SECRET）', 503);

  const body = (await request.json().catch(() => ({}))) as {
    orderId?: number;
    amount?: number;
    currency?: string;
    status?: string;
    timestamp?: number;
    signature?: string;
  };
  const orderId = Number(body.orderId);
  const amount = Number(body.amount);
  const currency = String(body.currency ?? '').toUpperCase();
  const status = String(body.status ?? '').toLowerCase();
  const timestamp = Number(body.timestamp);
  const signature = String(body.signature ?? '').toLowerCase();

  if (!Number.isInteger(orderId) || orderId <= 0) return fail('订单不对', 400);
  if (!Number.isFinite(amount) || amount < 0) return fail('金额不对', 400);
  if (!currency) return fail('币种不对', 400);
  if (status !== 'paid') return fail('只接受已支付回调', 400);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_SKEW_SECONDS) {
    return fail('回调已过期', 400);
  }

  const order = orderForWebhook(orderId);
  if (!order) return fail('订单不存在', 404);
  if (order.priceCents !== Math.round(amount)) return fail('支付金额与订单不一致', 400);
  if (paymentCurrency().toUpperCase() !== currency) return fail('支付币种与订单不一致', 400);

  const canonical = `${orderId}|${Math.round(amount)}|${currency}|${status}|${timestamp}`;
  const expected = createHmac('sha256', secret).update(canonical).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('签名不对', 401);

  const result = markOrderPaid(orderId, `webhook:${timestamp}`);
  return result.ok ? json(result) : fail(result.message, 400);
}
