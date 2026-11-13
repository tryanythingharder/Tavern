import { createHmac, randomInt } from 'node:crypto';
import db, { transaction } from '@/lib/db';
import { balance, grantPoints, spendPoints } from '@/lib/points';
import { notify } from '@/lib/notifications';
import { getSetting } from '@/lib/settings';

// M4 充值：兑换码 + 订单。
// 支付网关还没接（需要商户资质）：订单先落 pending，由管理员手动确认，
// 或者由 /api/payments/webhook（HMAC 校验）回调确认。两条路都写账本并通知用户。
export function pricePerPointCents(): number {
  return Math.max(1, Number(getSetting('billing.pricePerPointCents', process.env.TAVERN_PRICE_PER_POINT_CENTS ?? '1')));
}

// 上游每 1000 tokens 的成本（分），用于后台粗算毛利；0 表示未配置。
export function upstreamCostPer1kCents(): number {
  return Math.max(0, Number(getSetting('billing.upstreamCostPer1kCents', process.env.TAVERN_UPSTREAM_COST_PER_1K_CENTS ?? '0')));
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `TAV-${pick()}-${pick()}`;
}

export type RedeemCode = { id: number; code: string; amount: number; note: string; usedBy: number | null; usedByName: string | null; createdByName: string | null; createdAt: number };

type CodeRow = { id: number; code: string; amount: number; note: string; used_by: number | null; created_at: number; used_name?: string | null; creator_name?: string | null };

export function createCodes(adminId: number, amount: number, count: number, note: string): RedeemCode[] {
  const value = Math.max(1, Math.round(amount));
  const total = Math.max(1, Math.min(100, Math.round(count)));
  const insert = db.prepare('INSERT INTO redeem_codes (code, amount, note, created_by, created_at) VALUES (?,?,?,?,?)');
  const creator = (db.prepare('SELECT nickname FROM users WHERE id = ?').get(adminId) as { nickname: string } | undefined)?.nickname ?? null;
  const created: RedeemCode[] = [];
  for (let index = 0; index < total; index += 1) {
    let code = randomCode();
    // 极低概率撞码，重试几次
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const exists = db.prepare('SELECT 1 AS ok FROM redeem_codes WHERE code = ?').get(code);
      if (!exists) break;
      code = randomCode();
    }
    const result = insert.run(code, value, note.slice(0, 60), adminId, Date.now());
    created.push({ id: Number(result.lastInsertRowid), code, amount: value, note, usedBy: null, usedByName: null, createdByName: creator, createdAt: Date.now() });
  }
  return created;
}

export function listCodes(limit = 50): RedeemCode[] {
  const rows = db.prepare(`
        SELECT c.*, u.nickname AS used_name, cr.nickname AS creator_name
        FROM redeem_codes c LEFT JOIN users u ON u.id = c.used_by LEFT JOIN users cr ON cr.id = c.created_by
        ORDER BY c.id DESC LIMIT ?
    `).all(limit) as CodeRow[];
  return rows.map((row) => ({ id: row.id, code: row.code, amount: row.amount, note: row.note, usedBy: row.used_by, usedByName: row.used_name ?? null, createdByName: row.creator_name ?? null, createdAt: row.created_at }));
}

export function redeemCode(userId: number, input: string): { ok: boolean; message: string; amount?: number; balance?: number } {
  const code = String(input ?? '').trim().toUpperCase();
  if (!code) return { ok: false, message: '请输入兑换码' };
  return transaction(() => {
    const row = db.prepare('SELECT * FROM redeem_codes WHERE code = ?').get(code) as CodeRow | undefined;
    if (!row) return { ok: false, message: '兑换码不存在' };
    if (row.used_by !== null) return { ok: false, message: '这个兑换码已经被使用过了' };
    const changed = db.prepare('UPDATE redeem_codes SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL').run(userId, Date.now(), row.id);
    if (Number(changed.changes) === 0) return { ok: false, message: '这个兑换码已经被使用过了' };
    const next = grantPoints(userId, row.amount, `兑换码 ${row.code}`, 'recharge');
    notify(userId, { type: 'points', title: `兑换成功 +${row.amount} 点`, body: `兑换码 ${row.code}`, link: '/me/points' });
    return { ok: true, message: '兑换成功', amount: row.amount, balance: next };
  });
}

export type Order = { id: number; points: number; priceCents: number; status: string; provider: string; createdAt: number; paidAt: number | null };

type OrderRow = { id: number; points: number; price_cents: number; status: string; provider: string; created_at: number; paid_at: number | null };

function orderFromRow(row: OrderRow): Order {
  return { id: row.id, points: row.points, priceCents: row.price_cents, status: row.status, provider: row.provider, createdAt: row.created_at, paidAt: row.paid_at };
}

export function createOrder(userId: number, points: number, priceCents: number): Order {
  const value = Math.max(1, Math.round(points));
  const price = Math.max(1, Math.round(priceCents));
  const provider = getSetting('payment.provider', 'manual') || 'manual';
  const result = db.prepare('INSERT INTO orders (user_id, points, price_cents, status, provider, created_at) VALUES (?,?,?,?,?,?)').run(userId, value, price, 'pending', provider, Date.now());
  return orderFromRow(db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(result.lastInsertRowid)) as OrderRow);
}

function paymentSecret(): string {
  return getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? '');
}

export function paymentCurrency(): string {
  return getSetting('payment.currency', process.env.TAVERN_PAYMENT_CURRENCY ?? 'CNY');
}

// 结算页令牌使用独立派生密钥，绝不把 webhook 密钥的签名交给浏览器。
function checkoutSecret(): string {
  const explicit = getSetting('payment.checkoutSecret', process.env.TAVERN_PAYMENT_CHECKOUT_SECRET ?? '');
  if (explicit) return explicit;
  const webhook = paymentSecret();
  return webhook ? createHmac('sha256', webhook).update('checkout').digest('hex') : '';
}

// 通用托管结算页：配置了 payment.checkoutUrl 时，创建订单后跳转过去。
// 参数：orderId / points / amount（分）/ expires（Unix 秒）/ token。
// token = HMAC-SHA256(checkoutSecret, `${orderId}|${points}|${amount}|${expires}`)
// 它与 webhook 的签名密钥不同，即使浏览器拿到 token 也不能伪造支付回调。
export function checkoutLink(order: Order): string | null {
  const base = getSetting('payment.checkoutUrl', process.env.TAVERN_PAYMENT_CHECKOUT_URL ?? '');
  if (!base) return null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const expires = Math.floor(Date.now() / 1000) + 30 * 60;
    url.searchParams.set('orderId', String(order.id));
    url.searchParams.set('points', String(order.points));
    url.searchParams.set('amount', String(order.priceCents));
    url.searchParams.set('expires', String(expires));
    const secret = checkoutSecret();
    if (secret) {
      const token = createHmac('sha256', secret).update(`${order.id}|${order.points}|${order.priceCents}|${expires}`).digest('hex');
      url.searchParams.set('token', token);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function listOrders(userId: number, limit = 20): Order[] {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as OrderRow[];
  return rows.map(orderFromRow);
}

export function listPendingOrders(limit = 50): (Order & { userId: number; nickname: string; email: string })[] {
  const rows = db.prepare(`
        SELECT o.*, u.nickname, u.email FROM orders o JOIN users u ON u.id = o.user_id
        WHERE o.status = 'pending' ORDER BY o.id DESC LIMIT ?
    `).all(limit) as (OrderRow & { nickname: string; email: string; user_id: number })[];
  return rows.map((row) => ({ ...orderFromRow(row), userId: row.user_id, nickname: row.nickname, email: row.email }));
}

// 后台概览：最近订单（含已支付）
export function listRecentOrders(limit = 8): (Order & { userId: number; nickname: string; email: string })[] {
  const rows = db.prepare(`
        SELECT o.*, u.nickname, u.email FROM orders o JOIN users u ON u.id = o.user_id
        ORDER BY o.id DESC LIMIT ?
    `).all(limit) as (OrderRow & { nickname: string; email: string; user_id: number })[];
  return rows.map((row) => ({ ...orderFromRow(row), userId: row.user_id, nickname: row.nickname, email: row.email }));
}

// 后台订单页：全部订单（按时间倒序）
export function listAllOrders(limit = 20, offset = 0): (Order & { userId: number; nickname: string; email: string })[] {
  const rows = db.prepare(`
        SELECT o.*, u.nickname, u.email FROM orders o JOIN users u ON u.id = o.user_id
        ORDER BY o.id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as (OrderRow & { nickname: string; email: string; user_id: number })[];
  return rows.map((row) => ({ ...orderFromRow(row), userId: row.user_id, nickname: row.nickname, email: row.email }));
}

export function countOrders(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM orders').get() as { count: number }).count;
}

// 确认支付：写账本、改状态、发通知。重复调用不会重复加点。
export function markOrderPaid(orderId: number, providerOrderId?: string): { ok: boolean; message: string; points?: number } {
  return transaction(() => {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as (OrderRow & { user_id: number }) | undefined;
    if (!row) return { ok: false, message: '订单不存在' };
    if (row.status === 'paid') return { ok: true, message: '订单已支付', points: row.points };
    const changed = db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, provider_order_id = ? WHERE id = ? AND status = 'pending'").run(Date.now(), providerOrderId ?? null, orderId);
    if (Number(changed.changes) === 0) return { ok: true, message: '订单已支付', points: row.points };
    grantPoints(row.user_id, row.points, `订单 #${orderId} 充值`, 'recharge');
    notify(row.user_id, { type: 'points', title: `充值到账 +${row.points} 点`, body: `订单 #${orderId} 已确认`, link: '/me/points' });
    return { ok: true, message: '已确认', points: row.points };
  });
}

// 管理员退款：只对已到账订单生效；用户余额不足时不强扣，避免出现负余额。
export function refundOrder(orderId: number): { ok: boolean; message: string; points?: number } {
  return transaction(() => {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as (OrderRow & { user_id: number }) | undefined;
    if (!row) return { ok: false, message: '订单不存在' };
    if (row.status !== 'paid') return { ok: false, message: '只有已到账订单可以退款' };
    const spent = spendPoints(row.user_id, row.points, `订单 #${orderId} 退款`, 'refund');
    if (!spent.ok) return { ok: false, message: '用户余额不足，无法扣回点数；请先与用户确认' };
    const changed = db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ? AND status = 'paid'").run(orderId);
    if (Number(changed.changes) === 0) {
      grantPoints(row.user_id, row.points, `订单 #${orderId} 退款回滚`, 'adjust');
      return { ok: false, message: '订单状态已变化，退款未执行' };
    }
    notify(row.user_id, { type: 'points', title: `订单 #${orderId} 已退款`, body: `已扣回 ${row.points} 点`, link: '/me/points' });
    return { ok: true, message: '已退款', points: row.points };
  });
}

export function orderForWebhook(orderId: number): { id: number; status: string; priceCents: number } | undefined {
  const row = db.prepare('SELECT id, status, price_cents FROM orders WHERE id = ?').get(orderId) as { id: number; status: string; price_cents: number } | undefined;
  return row ? { id: row.id, status: row.status, priceCents: row.price_cents } : undefined;
}

export function userBalance(userId: number): number {
  return balance(userId);
}
