import db from '@/lib/db';
import { dayKeyIn, platformDayStart, startOfDayIn } from '@/lib/tz';
import type { AdminCharacter, AdminUser } from '@/lib/admin';

// 后台列表的服务端查询：搜索 / 筛选 / 排序 / 分页都在 SQL 里做，状态全部来自 URL 查询参数。
// 只读；写操作仍走原有 API（避免和审计埋点的改动冲突）。

export type SearchParams = Record<string, string | string[] | undefined>;
export type ListQuery = { q: string; page: number; per: number; sort: string; dir: 'asc' | 'desc'; f: Record<string, string> };
export type ListResult<T> = { rows: T[]; total: number; page: number; pages: number; per: number };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export function parseList(
  sp: SearchParams,
  opts: { sorts: string[]; sort: string; dir?: 'asc' | 'desc'; filters?: Record<string, string[]>; defaults?: Record<string, string>; per?: number },
): ListQuery {
  const per = [20, 50, 100].includes(Number(one(sp.per))) ? Number(one(sp.per)) : opts.per ?? 20;
  const sort = opts.sorts.includes(one(sp.sort)) ? one(sp.sort) : opts.sort;
  const dir = one(sp.dir) === 'asc' ? 'asc' : one(sp.dir) === 'desc' ? 'desc' : opts.dir ?? 'desc';
  const f: Record<string, string> = {};
  for (const [key, allowed] of Object.entries(opts.filters ?? {})) {
    const value = one(sp[key]);
    // 'all' 显式表示不过滤（用于有默认筛选的列表，比如审核默认只看待审）
    f[key] = value === 'all' ? '' : value && allowed.includes(value) ? value : opts.defaults?.[key] ?? '';
  }
  return { q: one(sp.q).trim().slice(0, 80), page: Math.max(1, Math.floor(Number(one(sp.page)) || 1)), per, sort, dir, f };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

function paged<T>(total: number, query: ListQuery, fetch: (limit: number, offset: number) => T[]): ListResult<T> {
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);
  return { rows: fetch(query.per, (page - 1) * query.per), total, page, pages, per: query.per };
}

// ── 玩家 ──
export const USER_LIST = { sorts: ['id', 'created', 'balance', 'nickname', 'tokens'], sort: 'id', dir: 'asc' as const, filters: { status: ['', 'active', 'banned', 'deleted'], role: ['', 'admin', 'user'] } };

export function queryUsers(query: ListQuery): ListResult<AdminUser> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (query.q) {
    const asId = /^#?\d+$/.test(query.q) ? Number(query.q.replace('#', '')) : -1;
    where.push("(u.nickname LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.id = ?)");
    args.push(like(query.q), like(query.q), asId);
  }
  if (query.f.status) { where.push('u.status = ?'); args.push(query.f.status); }
  if (query.f.role === 'admin') where.push("u.role = 'admin'");
  if (query.f.role === 'user') where.push("COALESCE(u.role, 'user') <> 'admin'");
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM users u ${sql}`).get(...args) as { n: number }).n;
  const order = { id: 'u.id', created: 'u.created_at', balance: 'balance', nickname: 'u.nickname', tokens: 'tokens_today' }[query.sort] ?? 'u.id';
  const start = platformDayStart();
  return paged(total, query, (limit, offset) => {
    const rows = db.prepare(`
      SELECT u.id, u.email, u.nickname, u.role, u.status, u.created_at,
             COALESCE((SELECT balance_after FROM points_ledger p WHERE p.user_id = u.id ORDER BY p.id DESC LIMIT 1), 0) AS balance,
             (SELECT COALESCE(SUM(total_tokens), 0) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ?) AS tokens_today,
             (SELECT COUNT(*) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ? AND g.status IN ('done','aborted')) AS runs_today
      FROM users u ${sql} ORDER BY ${order} ${query.dir.toUpperCase()}, u.id ${query.dir.toUpperCase()} LIMIT ? OFFSET ?
    `).all(start, start, ...args, limit, offset) as { id: number; email: string; nickname: string; role: string; status: string; created_at: number | null; balance: number; tokens_today: number; runs_today: number }[];
    return rows.map((row) => ({ id: row.id, email: row.email, nickname: row.nickname, role: row.role, status: row.status, createdAt: row.created_at, balance: row.balance, tokensToday: row.tokens_today, runsToday: row.runs_today }));
  });
}

export function userStatusCounts(): Record<string, number> {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status').all() as { status: string; n: number }[];
  const out: Record<string, number> = { '': 0 };
  for (const row of rows) { out[row.status] = row.n; out[''] += row.n; }
  return out;
}

// ── 订单 ──
export type AdminOrderRow = { id: number; points: number; priceCents: number; status: string; provider: string; createdAt: number; paidAt: number | null; userId: number; nickname: string; email: string };
export const ORDER_LIST = { sorts: ['id', 'price', 'points'], sort: 'id', dir: 'desc' as const, filters: { status: ['', 'pending', 'paid', 'refunded', 'cancelled'] } };

export function queryOrders(query: ListQuery, userId?: number): ListResult<AdminOrderRow> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (userId) { where.push('o.user_id = ?'); args.push(userId); }
  if (query.q) {
    const asId = /^#?\d+$/.test(query.q) ? Number(query.q.replace('#', '')) : -1;
    where.push("(o.id = ? OR u.nickname LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR o.provider_order_id = ?)");
    args.push(asId, like(query.q), like(query.q), query.q);
  }
  if (query.f.status) { where.push('o.status = ?'); args.push(query.f.status); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders o JOIN users u ON u.id = o.user_id ${sql}`).get(...args) as { n: number }).n;
  const order = { id: 'o.id', price: 'o.price_cents', points: 'o.points' }[query.sort] ?? 'o.id';
  return paged(total, query, (limit, offset) => {
    const rows = db.prepare(`
      SELECT o.id, o.points, o.price_cents, o.status, o.provider, o.created_at, o.paid_at, o.user_id, u.nickname, u.email
      FROM orders o JOIN users u ON u.id = o.user_id ${sql}
      ORDER BY ${order} ${query.dir.toUpperCase()}, o.id DESC LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as { id: number; points: number; price_cents: number; status: string; provider: string; created_at: number; paid_at: number | null; user_id: number; nickname: string; email: string }[];
    return rows.map((row) => ({ id: row.id, points: row.points, priceCents: row.price_cents, status: row.status, provider: row.provider, createdAt: row.created_at, paidAt: row.paid_at, userId: row.user_id, nickname: row.nickname, email: row.email }));
  });
}

function monthStart(): number {
  const now = Date.now();
  const day = Number(dayKeyIn(now).slice(8, 10)) || 1;
  return startOfDayIn(now - (day - 1) * 86_400_000);
}

/** 订单页 KPI：全站口径（不再只算当前页） */
export function orderStats() {
  const today = platformDayStart();
  const month = monthStart();
  // node:sqlite 返回 null 原型对象，传给客户端组件前要转成普通对象
  const get = (sql: string, ...args: number[]) => { const row = db.prepare(sql).get(...args) as { n: number; cents: number }; return { n: Number(row.n), cents: Number(row.cents) }; };
  return {
    paidToday: get("SELECT COUNT(*) AS n, COALESCE(SUM(price_cents),0) AS cents FROM orders WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?", today),
    pending: get("SELECT COUNT(*) AS n, COALESCE(SUM(price_cents),0) AS cents FROM orders WHERE status = 'pending'"),
    paidMonth: get("SELECT COUNT(*) AS n, COALESCE(SUM(price_cents),0) AS cents FROM orders WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?", month),
    refunded: get("SELECT COUNT(*) AS n, COALESCE(SUM(price_cents),0) AS cents FROM orders WHERE status = 'refunded'"),
  };
}

export function orderStatusCounts(userId?: number): Record<string, number> {
  const rows = db.prepare(`SELECT status, COUNT(*) AS n FROM orders ${userId ? 'WHERE user_id = ?' : ''} GROUP BY status`).all(...(userId ? [userId] : [])) as { status: string; n: number }[];
  const out: Record<string, number> = { '': 0 };
  for (const row of rows) { out[row.status] = row.n; out[''] += row.n; }
  return out;
}

// ── 广场审核 ──
export const REVIEW_LIST = { sorts: ['created', 'name'], sort: 'created', dir: 'desc' as const, filters: { status: ['', 'pending', 'published', 'archived', 'draft'], nsfw: ['', '1', '0'] }, defaults: { status: 'pending' } };

export type ReviewRow = AdminCharacter & { ownerId: number | null };

export function queryCharacters(query: ListQuery, ownerId?: number): ListResult<ReviewRow> {
  const where: string[] = ['c.owner_id IS NOT NULL'];
  const args: (string | number)[] = [];
  if (ownerId) { where.push('c.owner_id = ?'); args.push(ownerId); }
  if (query.q) { where.push("(c.name LIKE ? ESCAPE '\\' OR c.author LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\' OR c.id = ?)"); args.push(like(query.q), like(query.q), like(query.q), query.q); }
  if (query.f.status) { where.push('c.status = ?'); args.push(query.f.status); }
  if (query.f.nsfw) { where.push('c.nsfw = ?'); args.push(Number(query.f.nsfw)); }
  const sql = `WHERE ${where.join(' AND ')}`;
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM characters c LEFT JOIN users u ON u.id = c.owner_id ${sql}`).get(...args) as { n: number }).n;
  const order = query.sort === 'name' ? 'c.name' : 'c.created_at';
  return paged(total, query, (limit, offset) => {
    const rows = db.prepare(`
      SELECT c.id, c.name, c.author, c.category, c.status, c.nsfw, c.created_at, c.owner_id, u.nickname AS owner_name
      FROM characters c LEFT JOIN users u ON u.id = c.owner_id ${sql}
      ORDER BY ${order} ${query.dir.toUpperCase()}, c.rowid DESC LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as { id: string; name: string; author: string; category: string; status: string; nsfw: number; created_at: number | null; owner_id: number | null; owner_name: string | null }[];
    return rows.map((row) => ({ id: row.id, name: row.name, author: row.author, category: row.category, status: row.status, nsfw: row.nsfw === 1, createdAt: row.created_at, ownerName: row.owner_name, ownerId: row.owner_id }));
  });
}

export function characterStatusCounts(): Record<string, number> {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM characters WHERE owner_id IS NOT NULL GROUP BY status').all() as { status: string; n: number }[];
  const out: Record<string, number> = { '': 0 };
  for (const row of rows) { out[row.status] = row.n; out[''] += row.n; }
  return out;
}

// ── 举报 ──
export type AdminReportRow = { id: number; reporterId: number; reporterName: string; targetType: string; targetId: string; reason: string; note: string; status: string; createdAt: number; handledAt: number | null };
export const REPORT_LIST = { sorts: ['id'], sort: 'id', dir: 'desc' as const, filters: { status: ['', 'open', 'resolved', 'dismissed'], type: ['', 'character', 'message', 'user', 'comment', 'other'] }, defaults: { status: 'open' } };

export function queryReports(query: ListQuery): ListResult<AdminReportRow> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (query.q) { where.push("(r.reason LIKE ? ESCAPE '\\' OR r.note LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\' OR r.target_id = ?)"); args.push(like(query.q), like(query.q), like(query.q), query.q); }
  if (query.f.status) { where.push('r.status = ?'); args.push(query.f.status); }
  if (query.f.type) { where.push('r.target_type = ?'); args.push(query.f.type); }
  const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM reports r JOIN users u ON u.id = r.reporter_id ${sql}`).get(...args) as { n: number }).n;
  return paged(total, query, (limit, offset) => {
    const rows = db.prepare(`
      SELECT r.id, r.reporter_id, u.nickname, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at, r.handled_at
      FROM reports r JOIN users u ON u.id = r.reporter_id ${sql}
      ORDER BY r.id ${query.dir.toUpperCase()} LIMIT ? OFFSET ?
    `).all(...args, limit, offset) as { id: number; reporter_id: number; nickname: string; target_type: string; target_id: string; reason: string; note: string; status: string; created_at: number; handled_at: number | null }[];
    return rows.map((row) => ({ id: row.id, reporterId: row.reporter_id, reporterName: row.nickname, targetType: row.target_type, targetId: row.target_id, reason: row.reason, note: row.note, status: row.status, createdAt: row.created_at, handledAt: row.handled_at }));
  });
}

export function reportStatusCounts(): Record<string, number> {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').all() as { status: string; n: number }[];
  const out: Record<string, number> = { '': 0 };
  for (const row of rows) { out[row.status] = row.n; out[''] += row.n; }
  return out;
}

// ── 用户详情聚合用：针对某个用户的举报（被举报的是他本人 / 他的作品 / 他的消息与评论） ──
export function reportsAgainstUser(userId: number, limit = 30): AdminReportRow[] {
  const rows = db.prepare(`
    SELECT r.id, r.reporter_id, u.nickname, r.target_type, r.target_id, r.reason, r.note, r.status, r.created_at, r.handled_at
    FROM reports r JOIN users u ON u.id = r.reporter_id
    WHERE (r.target_type = 'user' AND r.target_id = CAST(? AS TEXT))
       OR (r.target_type = 'character' AND r.target_id IN (SELECT id FROM characters WHERE owner_id = ?))
       OR (r.target_type = 'comment' AND r.target_id IN (SELECT CAST(id AS TEXT) FROM comments WHERE user_id = ?))
    ORDER BY r.id DESC LIMIT ?
  `).all(userId, userId, userId, limit) as { id: number; reporter_id: number; nickname: string; target_type: string; target_id: string; reason: string; note: string; status: string; created_at: number; handled_at: number | null }[];
  return rows.map((row) => ({ id: row.id, reporterId: row.reporter_id, reporterName: row.nickname, targetType: row.target_type, targetId: row.target_id, reason: row.reason, note: row.note, status: row.status, createdAt: row.created_at, handledAt: row.handled_at }));
}
