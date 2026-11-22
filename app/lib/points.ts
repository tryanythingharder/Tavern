import db, { transaction } from '@/lib/db';
import { notify } from '@/lib/notifications';
import { getSetting } from '@/lib/settings';
import { consumeDailyFree, rewardReferrerOnFirstUse } from '@/lib/growth';

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


// ── 计费规则（参考 new-api：按量 / 按次 / 按上下文分档）──────────────────────
// 后台「模型广场」写 points.rules：{"模型id": {mode, price, tiers}}。
//  mode=token：price = 点 / 千 tokens（输入+输出合计）
//  mode=call ：price = 点 / 次（每次生成固定扣，和 token 数无关）
//  tiers：按本次输入（上下文）tokens 分档，输入 > above 时改用该档 price，取命中的最高一档。
// 没配规则的模型兼容旧的 points.models（按量），再没有就用全局单价 points.text。
export type PriceTier = { above: number; price: number };
export type PriceRule = { mode: 'token' | 'call'; price: number; tiers: PriceTier[] };

const round2 = (value: number) => Math.round(value * 100) / 100;

export function normalizeRule(value: unknown): PriceRule | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === 'call' ? 'call' : 'token';
  const price = Number(raw.price);
  if (!Number.isFinite(price) || price < 0 || price > 100000) return null;
  const tiers = (Array.isArray(raw.tiers) ? raw.tiers : [])
    .map((tier) => ({ above: Math.round(Number((tier as PriceTier)?.above)), price: Number((tier as PriceTier)?.price) }))
    .filter((tier) => Number.isFinite(tier.above) && tier.above > 0 && tier.above <= 10_000_000 && Number.isFinite(tier.price) && tier.price >= 0 && tier.price <= 100000)
    .map((tier) => ({ above: tier.above, price: round2(tier.price) }))
    .sort((a, b) => a.above - b.above)
    .filter((tier, index, list) => index === 0 || tier.above !== list[index - 1].above)
    .slice(0, 6);
  return { mode, price: round2(price), tiers };
}

export function priceRules(): Record<string, PriceRule> {
  try {
    const data = JSON.parse(getSetting('points.rules', '{}')) as Record<string, unknown>;
    const out: Record<string, PriceRule> = {};
    for (const [id, rule] of Object.entries(data)) {
      const clean = normalizeRule(rule);
      if (id.trim() && clean) out[id.trim()] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

// 模型自己的规则（null = 跟随全局单价）
export function ownPriceRule(model?: string | null): PriceRule | null {
  const id = String(model ?? '').trim();
  if (!id) return null;
  const rules = priceRules();
  if (rules[id]) return rules[id];
  const legacy = modelPrices();
  if (id in legacy) return { mode: 'token', price: legacy[id], tiers: [] };
  return null;
}

export function priceRule(model?: string | null): PriceRule {
  return ownPriceRule(model) ?? { mode: 'token', price: pointsPerThousand(), tiers: [] };
}

export function tierPrice(rule: PriceRule, promptTokens: number): number {
  let price = rule.price;
  for (const tier of rule.tiers) if (promptTokens > tier.above) price = tier.price;
  return price;
}

export function modelPricePer1k(model?: string | null): number {
  return priceRule(model).price;
}

// 一次生成扣多少点：按次 = 档位价；按量 = (输入+输出)×档位价/1000，不足 1 点按 1 点
export function pointsCost(promptTokens: number, completionTokens: number, model?: string | null): number {
  const rule = priceRule(model);
  const prompt = Math.max(0, promptTokens);
  const price = tierPrice(rule, prompt);
  if (rule.mode === 'call') return Math.max(0, Math.ceil(price));
  return Math.max(1, Math.ceil(((prompt + Math.max(0, completionTokens)) * price) / 1000));
}

const kTokens = (n: number) => (n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : n >= 1000 ? `${round2(n / 1000)}K` : String(n));
const unit = (rule: PriceRule) => (rule.mode === 'call' ? '点/次' : '点/千 tokens');

// 展示用：「3 点/次 · 上下文超 272K 6 点」
export function priceLabel(rule: PriceRule): string {
  const base = `${rule.price} ${unit(rule)}`;
  if (!rule.tiers.length) return base;
  return `${base} · ${rule.tiers.map((tier) => `超 ${kTokens(tier.above)} ${tier.price} 点`).join(' · ')}`;
}

export function priceShort(rule: PriceRule): string {
  return `${rule.price} ${rule.mode === 'call' ? '点/次' : '点/千'}${rule.tiers.length ? '起' : ''}`;
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
export function settleGeneration(userId: number, reserved: number, actual: number, refId: string): { cost: number; free: number; balance: number } {
  const total = Math.max(0, Math.round(actual));
  // 每日免费额度先抵扣（后台 growth.dailyFree，0 = 关闭）
  const free = consumeDailyFree(userId, total);
  const cost = total - free;
  if (free > 0) {
    db.prepare('INSERT INTO points_ledger (user_id, kind, amount, balance_after, note, ref_id, created_at) VALUES (?,?,?,?,?,?,?)').run(userId, 'free', 0, balance(userId), `每日免费额度抵扣 ${free} 点 · ${refId}`, refId, Date.now());
  }
  if (cost < reserved) {
    grantPoints(userId, reserved - cost, `结算退回 · ${refId}`, 'adjust');
  } else if (cost > reserved) {
    const extra = spendPoints(userId, cost - reserved, `补扣 · ${refId}`, refId);
    if (!extra.ok) console.warn('[points] 生成补扣失败', { userId, refId, extra: cost - reserved });
  }
  if (total > 0) {
    try { rewardReferrerOnFirstUse(userId); } catch (error) { console.warn('[growth] 邀请奖励失败', error); }
  }
  return { cost, free, balance: balance(userId) };
}

// 生成结束后扣费；余额刚跌破阈值时发一条站内通知（只发一次）。
export function chargeGeneration(userId: number, refId: string, totalTokens: number): number {
  const cost = pointsCost(totalTokens, 0);
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
