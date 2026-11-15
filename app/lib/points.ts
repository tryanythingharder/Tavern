import db, { transaction } from '@/lib/db';
import { notify } from '@/lib/notifications';
import { getSetting } from '@/lib/settings';

// M4 点数：账本式记账。每笔都写 balance_after，余额 = 最后一笔的 balance_after，
// 这样对账时能逐笔回放（比只存一个余额字段更可靠）。
export const STARTING_POINTS = Math.max(0, Number(process.env.TAVERN_STARTING_POINTS ?? 500));
const LOW_BALANCE = 10;

// 文本模型计费：后台可改，数据库优先，环境变量兜底
export function pointsPerThousand(): number {
  return Math.max(0, Number(getSetting('points.text', process.env.TAVERN_POINTS_PER_1K ?? '2')));
}

export type LedgerRow = { id: number; kind: string; amount: number; balanceAfter: number; note: string; createdAt: number };

type Row = { id: number; kind: string; amount: number; balance_after: number; note: string; created_at: number };

export function balance(userId: number): number {
  const row = db.prepare('SELECT balance_after FROM points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId) as { balance_after: number } | undefined;
  return row ? row.balance_after : 0;
}

// 新账号送一笔初始点数（只在完全没有账本记录时发生）
export function ensureStartingPoints(userId: number): number {
  const has = db.prepare('SELECT 1 AS ok FROM points_ledger WHERE user_id = ? LIMIT 1').get(userId);
  if (has) return balance(userId);
  return grantPoints(userId, STARTING_POINTS, '新账号赠送', 'grant');
}

export function grantPoints(userId: number, amount: number, note: string, kind = 'grant'): number {
  return transaction(() => {
    const current = balance(userId);
    const next = Math.max(0, current + Math.round(amount));
    const delta = next - current; // 扣除时不会把余额扣成负数
    db.prepare('INSERT INTO points_ledger (user_id, kind, amount, balance_after, note, created_at) VALUES (?,?,?,?,?,?)').run(userId, kind, delta, next, note, Date.now());
    return next;
  });
}

// 按模型计价：后台 points.models（JSON 对象 {"模型id": 每千 tokens 点数}）优先，
// 环境变量 TAVERN_MODEL_PRICES（"a=6,b=3" 或 JSON）兜底；没单独定价的模型用统一价 points.text。
export function parseModelPrices(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  const text = String(raw ?? '').trim();
  if (!text) return out;
  const put = (key: unknown, value: unknown) => {
    const id = String(key ?? '').trim();
    const price = Number(value);
    if (id && Number.isFinite(price) && price >= 0) out[id] = Math.round(price * 100) / 100;
  };
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>;
      for (const [key, value] of Object.entries(obj)) put(key, value);
    } catch { /* 格式不对就当没配置 */ }
    return out;
  }
  for (const part of text.split(/[,\n;]+/)) {
    const [key, value] = part.split(/[=:]/);
    put(key, value);
  }
  return out;
}

export function modelPrices(): Record<string, number> {
  return parseModelPrices(getSetting('points.models', process.env.TAVERN_MODEL_PRICES ?? ''));
}

export function modelPricePer1k(model?: string | null): number {
  const id = String(model ?? '').trim();
  if (id) {
    const prices = modelPrices();
    if (id in prices) return prices[id];
  }
  return pointsPerThousand();
}

export function pointsCost(totalTokens: number, model?: string | null): number {
  return Math.max(1, Math.ceil((Math.max(0, totalTokens) * modelPricePer1k(model)) / 1000));
}

export function spendPoints(userId: number, amount: number, note: string, refId?: string): { ok: boolean; balance: number; previous: number } {
  return transaction(() => {
    const current = balance(userId);
    const cost = Math.max(0, Math.round(amount));
    if (current < cost) return { ok: false, balance: current, previous: current };
    const next = current - cost;
    db.prepare('INSERT INTO points_ledger (user_id, kind, amount, balance_after, note, ref_id, created_at) VALUES (?,?,?,?,?,?,?)').run(userId, 'spend', -cost, next, note, refId ?? null, Date.now());
    return { ok: true, balance: next, previous: current };
  });
}

// 生成前预扣：按「prompt + max_tokens」估算最大成本，先锁定，结束后按实际结算。
// 这样余额 1 点、单次成本 6 点时不会先跑完再扣费失败；中断/失败也会按实际 token 结算。
export function reservePoints(userId: number, amount: number, note: string, refId?: string): { ok: boolean; reserved: number; balance: number } {
  const cost = Math.max(0, Math.round(amount));
  if (cost === 0) return { ok: true, reserved: 0, balance: balance(userId) };
  const result = spendPoints(userId, cost, `预扣 · ${note}`, refId);
  return { ok: result.ok, reserved: result.ok ? cost : 0, balance: result.balance };
}

// 结算预扣：多退少补。补扣失败时记录告警，至少不会把已产生的成本退回去。
export function settleGeneration(userId: number, reserved: number, actual: number, refId: string): { cost: number; balance: number } {
  const cost = Math.max(0, Math.round(actual));
  if (cost < reserved) {
    grantPoints(userId, reserved - cost, `结算退回 · ${refId}`, 'adjust');
  } else if (cost > reserved) {
    const extra = spendPoints(userId, cost - reserved, `补扣 · ${refId}`, refId);
    if (!extra.ok) console.warn('[points] 生成补扣失败', { userId, refId, extra: cost - reserved });
  }
  return { cost, balance: balance(userId) };
}

// 生成结束后扣费；余额刚跌破阈值时发一条站内通知（只发一次）。
export function chargeGeneration(userId: number, refId: string, totalTokens: number): number {
  const cost = pointsCost(totalTokens);
  const result = spendPoints(userId, cost, `${totalTokens} tokens`, refId);
  if (result.ok && result.previous >= LOW_BALANCE && result.balance < LOW_BALANCE) {
    notify(userId, { type: 'points', title: '点数不多了', body: `剩余 ${result.balance} 点。可以在「我的 · 点数」查看明细。`, link: '/me/points' });
  }
  return cost;
}

export function listLedger(userId: number, limit = 50): LedgerRow[] {
  const rows = db.prepare('SELECT * FROM points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as Row[];
  return rows.map((row) => ({ id: row.id, kind: row.kind, amount: row.amount, balanceAfter: row.balance_after, note: row.note, createdAt: row.created_at }));
}

export function pointsSummary(userId: number) {
  const current = balance(userId);
  const spent = db.prepare("SELECT COALESCE(SUM(-amount), 0) AS total FROM points_ledger WHERE user_id = ? AND amount < 0").get(userId) as { total: number };
  const gained = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM points_ledger WHERE user_id = ? AND amount > 0').get(userId) as { total: number };
  return { balance: current, spent: spent.total, gained: gained.total, low: current < LOW_BALANCE, perThousand: pointsPerThousand() };
}

export function isLowBalance(current: number): boolean {
  return current < LOW_BALANCE;
}
