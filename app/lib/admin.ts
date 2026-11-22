import db from '@/lib/db';
import { platformDayStart } from '@/lib/tz';
import { upstreamCostPer1kCents } from '@/lib/billing';

// 后台用的只读汇总：用户、余额、今日用量。
export type AdminUser = { id: number; email: string; nickname: string; role: string; status: string; createdAt: number | null; balance: number; tokensToday: number; runsToday: number };

export function adminUsers(limit = 20, offset = 0): AdminUser[] {
  const start = new Date(platformDayStart());
  const rows = db.prepare(`
        SELECT u.id, u.email, u.nickname, u.role, u.status, u.created_at,
               (SELECT balance_after FROM points_ledger p WHERE p.user_id = u.id ORDER BY p.id DESC LIMIT 1) AS balance,
               (SELECT COALESCE(SUM(total_tokens), 0) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ?) AS tokens_today,
               (SELECT COUNT(*) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ? AND g.status IN ('done','aborted')) AS runs_today
        FROM users u ORDER BY u.id LIMIT ? OFFSET ?
    `).all(start.getTime(), start.getTime(), limit, offset) as { id: number; email: string; nickname: string; role: string; status: string; created_at: number | null; balance: number | null; tokens_today: number; runs_today: number }[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    nickname: row.nickname,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    balance: row.balance ?? 0,
    tokensToday: row.tokens_today,
    runsToday: row.runs_today,
  }));
}

export function adminUserCount(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
}

export type AdminUserDetail = {
  user: AdminUser;
  orders: { id: number; points: number; priceCents: number; status: string; provider: string; createdAt: number }[];
  ledger: { id: number; kind: string; amount: number; balanceAfter: number; note: string; createdAt: number }[];
  characters: { id: string; name: string; status: string; createdAt: number | null }[];
  sessions: { token: string; createdAt: number | null; expiresAt: number; userAgent: string | null; ip: string | null }[];
  reports: { id: number; reason: string; targetType: string; targetId: string; status: string; createdAt: number }[];
};

export function adminUserDetail(id: number): AdminUserDetail | null {
  const start = new Date(platformDayStart());
  const row = db.prepare(`
        SELECT u.id, u.email, u.nickname, u.role, u.status, u.created_at,
               (SELECT balance_after FROM points_ledger p WHERE p.user_id = u.id ORDER BY p.id DESC LIMIT 1) AS balance,
               (SELECT COALESCE(SUM(total_tokens), 0) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ?) AS tokens_today,
               (SELECT COUNT(*) FROM generation_events g WHERE g.user_id = u.id AND g.created_at >= ? AND g.status IN ('done','aborted')) AS runs_today
        FROM users u WHERE u.id = ?
    `).get(start.getTime(), start.getTime(), id) as { id: number; email: string; nickname: string; role: string; status: string; created_at: number | null; balance: number | null; tokens_today: number; runs_today: number } | undefined;
  if (!row) return null;

  const orders = db.prepare('SELECT id, points, price_cents, status, provider, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(id) as
    { id: number; points: number; price_cents: number; status: string; provider: string; created_at: number }[];
  const ledger = db.prepare('SELECT id, kind, amount, balance_after, note, created_at FROM points_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(id) as
    { id: number; kind: string; amount: number; balance_after: number; note: string; created_at: number }[];
  const characters = db.prepare('SELECT id, name, status, created_at FROM characters WHERE owner_id = ? ORDER BY created_at DESC LIMIT 30').all(id) as
    { id: string; name: string; status: string; created_at: number | null }[];
  const sessions = db.prepare('SELECT token, created_at, expires_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20').all(id, Date.now()) as
    { token: string; created_at: number | null; expires_at: number; user_agent: string | null; ip: string | null }[];
  const reports = db.prepare('SELECT id, reason, target_type, target_id, status, created_at FROM reports WHERE reporter_id = ? ORDER BY id DESC LIMIT 20').all(id) as
    { id: number; reason: string; target_type: string; target_id: string; status: string; created_at: number }[];

  return {
    user: {
      id: row.id, email: row.email, nickname: row.nickname, role: row.role, status: row.status,
      createdAt: row.created_at, balance: row.balance ?? 0, tokensToday: row.tokens_today, runsToday: row.runs_today,
    },
    orders: orders.map((item) => ({ id: item.id, points: item.points, priceCents: item.price_cents, status: item.status, provider: item.provider, createdAt: item.created_at })),
    ledger: ledger.map((item) => ({ id: item.id, kind: item.kind, amount: item.amount, balanceAfter: item.balance_after, note: item.note, createdAt: item.created_at })),
    characters: characters.map((item) => ({ id: item.id, name: item.name, status: item.status, createdAt: item.created_at })),
    sessions: sessions.map((item) => ({ token: item.token, createdAt: item.created_at, expiresAt: item.expires_at, userAgent: item.user_agent, ip: item.ip })),
    reports: reports.map((item) => ({ id: item.id, reason: item.reason, targetType: item.target_type, targetId: item.target_id, status: item.status, createdAt: item.created_at })),
  };
}

export type AdminCharacter = { id: string; name: string; author: string; category: string; status: string; nsfw: boolean; createdAt: number | null; ownerName: string | null };

// 广场审核：用户创建的角色（种子角色不在这里）
export function adminCharacters(): AdminCharacter[] {
  const rows = db.prepare(`
        SELECT c.id, c.name, c.author, c.category, c.status, c.nsfw, c.created_at, u.nickname AS owner_name
        FROM characters c LEFT JOIN users u ON u.id = c.owner_id
        WHERE c.owner_id IS NOT NULL ORDER BY c.created_at DESC, c.rowid DESC
    `).all() as { id: string; name: string; author: string; category: string; status: string; nsfw: number; created_at: number | null; owner_name: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    author: row.author,
    category: row.category,
    status: row.status,
    nsfw: row.nsfw === 1,
    createdAt: row.created_at,
    ownerName: row.owner_name,
  }));
}

export function adminTotals() {
  const start = new Date(platformDayStart());
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  const today = db.prepare("SELECT COUNT(*) AS runs, COALESCE(SUM(total_tokens), 0) AS tokens FROM generation_events WHERE created_at >= ? AND status IN ('done','aborted')").get(start.getTime()) as { runs: number; tokens: number };
  const spend = db.prepare("SELECT COALESCE(SUM(-amount), 0) AS total FROM points_ledger WHERE amount < 0 AND created_at >= ?").get(start.getTime()) as { total: number };
  // 收入只算今天真正到账的订单；pending/refunded 不能计入营收
  const orders = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(price_cents), 0) AS cents FROM orders WHERE status = 'paid' AND paid_at >= ?").get(start.getTime()) as { count: number; cents: number };
  const pendingOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'").get() as { count: number };
  const pendingChars = db.prepare("SELECT COUNT(*) AS count FROM characters WHERE owner_id IS NOT NULL AND status = 'pending'").get() as { count: number };
  const upstreamCostToday = Math.round((today.tokens * upstreamCostPer1kCents()) / 1000);
  return {
    users: users.count,
    runs: today.runs,
    tokens: today.tokens,
    spentToday: spend.total,
    ordersToday: orders.count,
    revenueToday: orders.cents,
    upstreamCostToday,
    marginToday: orders.cents - upstreamCostToday,
    pendingOrders: pendingOrders.count,
    pendingCharacters: pendingChars.count,
  };
}
