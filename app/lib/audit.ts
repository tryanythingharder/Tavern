import db, { transaction } from '@/lib/db';
import { ipFromHeaders } from '@/lib/rate-limit';
import { PLATFORM_TZ, startOfDayIn } from '@/lib/tz';

// 操作日志（activity_log）：用户、管理员、系统三类操作统一一张表。
// 只记元数据：绝不写聊天内容、密码、token、API 密钥、卡密明文（卡密只记末 4 位）。
// 写日志失败不影响业务：logActivity 内部吞掉错误，只打一行 warn。
// 旧表 audit_log（只有管理员操作）首次使用时幂等迁入（legacy_id 唯一），之后不再写旧表。

export type ActorRole = 'user' | 'admin' | 'system';

export type ActivityInput = {
  actorId?: number | null;
  actorRole?: ActorRole;
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  detail?: string | Record<string, unknown>;
  ip?: string;
  userAgent?: string;
};

const LIMITS = { action: 64, targetType: 32, targetId: 80, ip: 64, userAgent: 200, detail: 500, account: 80 };
const SECRET_KEY = /pass|token|secret|api_?key|apikey|authorization|cookie|content|message|text|prompt|^code$/i;

// ---------- 动作目录：点分代码 → 中文名（界面文案是中文词条，英文走 en.json） ----------
export const ACTION_LABELS: Record<string, string> = {
  'auth.login': '登录成功',
  'auth.login_failed': '登录失败',
  'auth.register': '注册',
  'auth.logout': '退出登录',
  'auth.password_change': '修改密码',
  'auth.password_reset': '重置密码',
  'account.delete': '注销账号',
  'data.export': '导出账号数据',
  'character.publish': '发布角色',
  'character.draft': '保存角色草稿',
  'character.update': '修改角色',
  'character.delete': '删除角色',
  'character.import': '导入角色卡',
  'points.purchase': '充值到账',
  'points.redeem_code': '使用兑换码',
  'invite.use': '使用邀请码',
  'report.create': '提交举报',
  'admin.announcement.update': '更新公告',
  'admin.announcement.close': '关闭公告',
  'admin.channel.create': '新建模型渠道',
  'admin.channel.update': '修改模型渠道',
  'admin.channel.delete': '删除模型渠道',
  'admin.character.archive': '下架角色',
  'admin.character.restore': '恢复角色',
  'admin.comment.delete': '删除他人评论',
  'admin.code.generate': '生成兑换码',
  'admin.embedding.update': '修改向量模型配置',
  'admin.points.grant': '赠点',
  'admin.points.deduct': '扣点',
  'admin.invite.require_on': '开启邀请码注册',
  'admin.invite.require_off': '关闭邀请码注册',
  'admin.invite.generate': '生成邀请码',
  'admin.models.catalog': '修改模型目录',
  'admin.nsfw.update': '修改内容分级',
  'admin.user.age_update': '修改玩家年龄信息',
  'admin.order.pay': '确认订单到账',
  'admin.order.refund': '订单退款',
  'admin.services.update': '修改站点与服务',
  'admin.media.webp': '旧图转 webp',
  'admin.push.rekey': '重新生成推送密钥',
  'admin.settings.update': '修改接口配置',
  'admin.user.promote': '设为管理员',
  'admin.user.demote': '取消管理员',
  'admin.user.ban': '封禁用户',
  'admin.user.unban': '解封用户',
  'admin.report.resolve': '处理举报',
  'admin.report.dismiss': '驳回举报',
  'admin.audit.export': '导出操作日志',
};

export const ACTION_GROUPS: { id: string; label: string; prefixes: string[] }[] = [
  { id: 'auth', label: '登录与注册', prefixes: ['auth.'] },
  { id: 'account', label: '账号与数据', prefixes: ['account.', 'data.'] },
  { id: 'character', label: '角色', prefixes: ['character.'] },
  { id: 'points', label: '点数与邀请', prefixes: ['points.', 'invite.'] },
  { id: 'report', label: '举报', prefixes: ['report.'] },
  { id: 'admin', label: '管理员操作', prefixes: ['admin.'] },
];

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// 旧 logAdmin 调用传的是中文动作名：映射成点分代码，旧数据迁移时也用它
const LEGACY_ACTIONS: Record<string, string> = Object.fromEntries(
  Object.entries(ACTION_LABELS).filter(([code]) => code.startsWith('admin.')).map(([code, label]) => [label, code]),
);
LEGACY_ACTIONS['models.catalog'] = 'admin.models.catalog';

export function normalizeAdminAction(action: string): string {
  if (LEGACY_ACTIONS[action]) return LEGACY_ACTIONS[action];
  if (action.startsWith('admin.')) return action;
  return `admin.${action}`;
}

// 从旧式描述里猜对象：「用户 #12」「订单 #3」「举报 #5」「名字 (#abc)」「user:12」
export function guessTarget(detail: string): { type: string; id: string } {
  let m = detail.match(/用户 #(\d+)/) || detail.match(/user:(\d+)/);
  if (m) return { type: 'user', id: m[1] };
  if ((m = detail.match(/订单 #(\d+)/))) return { type: 'order', id: m[1] };
  if ((m = detail.match(/举报 #(\d+)/))) return { type: 'report', id: m[1] };
  if ((m = detail.match(/\(#([\w-]+)\)/))) return { type: 'character', id: m[1] };
  return { type: '', id: '' };
}

// ---------- 清洗 ----------
export function clip(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function last4(code: string): string {
  const clean = String(code ?? '').trim();
  return clean.length <= 4 ? '****' : `…${clean.slice(-4)}`;
}

// 详情对象：去掉一切像密钥/正文的键，值截断；字符串原样截断
export function sanitizeDetail(detail: ActivityInput['detail']): string {
  if (detail == null) return '';
  if (typeof detail === 'string') return clip(detail, LIMITS.detail);
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEY.test(key) || value === undefined) continue;
    safe[key] = typeof value === 'string' ? clip(value, 120) : typeof value === 'number' || typeof value === 'boolean' || value === null ? value : clip(JSON.stringify(value), 120);
  }
  return clip(JSON.stringify(safe), LIMITS.detail);
}

// ---------- 表结构与旧数据迁移（幂等） ----------
let schemaReady = false;
function ensureSchema(): void {
  if (schemaReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        actor_role TEXT NOT NULL DEFAULT 'user',
        action TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT '',
        target_id TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT '',
        user_agent TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        legacy_id INTEGER UNIQUE
    );
    CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_actor_time ON activity_log(actor_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_action_time ON activity_log(action, created_at);
  `);
  migrateLegacy();
  schemaReady = true;
}

export function migrateLegacy(): number {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'audit_log'").get();
  if (!exists) return 0;
  const rows = db.prepare(`
        SELECT a.id, a.admin_id, a.action, a.detail, a.created_at FROM audit_log a
        WHERE NOT EXISTS (SELECT 1 FROM activity_log l WHERE l.legacy_id = a.id)
        ORDER BY a.id
    `).all() as { id: number; admin_id: number; action: string; detail: string; created_at: number }[];
  if (!rows.length) return 0;
  const insert = db.prepare(`
        INSERT OR IGNORE INTO activity_log (actor_id, actor_role, action, target_type, target_id, detail, created_at, legacy_id)
        VALUES (?, 'admin', ?, ?, ?, ?, ?, ?)
    `);
  return transaction(() => {
    let moved = 0;
    for (const row of rows) {
      const target = guessTarget(row.detail ?? '');
      moved += Number(insert.run(row.admin_id, normalizeAdminAction(row.action), target.type, target.id, clip(row.detail, LIMITS.detail), row.created_at, row.id).changes);
    }
    return moved;
  });
}

// 模块加载时就建表迁移（不在别人的事务里）；失败时下次写入再试
try { ensureSchema(); } catch (error) { console.warn('[audit] 初始化操作日志表失败', error); }

// ---------- 数据保留：TAVERN_AUDIT_RETENTION_DAYS（默认 180），节流清理 ----------
const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSweep = 0;

export function retentionDays(): number {
  const n = Number(process.env.TAVERN_AUDIT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 180;
}

export function sweepActivity(now = Date.now()): number {
  lastSweep = now;
  ensureSchema();
  return Number(db.prepare('DELETE FROM activity_log WHERE created_at < ?').run(now - retentionDays() * 86400000).changes);
}

// ---------- 请求上下文：同步拿 IP / UA（route handler 与 server action 都在请求作用域里） ----------
let nodeRequire: ((id: string) => unknown) | null = null;
let storageMod: { workUnitAsyncStorage?: { getStore?: () => { headers?: { get(name: string): string | null } } | undefined } } | null = null;
function requestHeaders(): { get(name: string): string | null } | null {
  try {
    if (!storageMod) {
      if (!nodeRequire) nodeRequire = eval('require');
      storageMod = nodeRequire!('next/dist/server/app-render/work-unit-async-storage.external.js') as typeof storageMod;
    }
    return storageMod?.workUnitAsyncStorage?.getStore?.()?.headers ?? null;
  } catch {
    return null;
  }
}

// ---------- 写入 ----------
export function logActivity(input: ActivityInput): void {
  try {
    ensureSchema();
    const now = Date.now();
    if (now - lastSweep >= SWEEP_EVERY_MS) {
      try { sweepActivity(now); } catch (error) { console.warn('[audit] 清理过期日志失败', error); }
    }
    const headers = input.ip === undefined || input.userAgent === undefined ? requestHeaders() : null;
    const ip = input.ip ?? (headers ? ipFromHeaders(headers) : '');
    const ua = input.userAgent ?? headers?.get('user-agent') ?? '';
    db.prepare(`
            INSERT INTO activity_log (actor_id, actor_role, action, target_type, target_id, ip, user_agent, detail, created_at)
            VALUES (?,?,?,?,?,?,?,?,?)
        `).run(
      input.actorId ?? null,
      input.actorRole ?? 'user',
      clip(input.action, LIMITS.action),
      clip(input.targetType ?? '', LIMITS.targetType),
      clip(input.targetId ?? '', LIMITS.targetId),
      clip(ip === 'unknown' ? '' : ip, LIMITS.ip),
      clip(ua, LIMITS.userAgent),
      sanitizeDetail(input.detail),
      now,
    );
  } catch (error) {
    console.warn('[audit] 写操作日志失败', input.action, error instanceof Error ? error.message : error);
  }
}

// 旧接口保留：后台各处 logAdmin(adminId, '赠点', '用户 #3 +10 点') 照常可用
export function logAdmin(adminId: number, action: string, detail = '', target?: { type: string; id: string | number }): void {
  const guessed = target ?? guessTarget(detail);
  logActivity({ actorId: adminId, actorRole: 'admin', action: normalizeAdminAction(action), targetType: guessed.type, targetId: String(guessed.id ?? ''), detail });
}

// 登录失败：记下尝试的账号名（截断），不记密码
export function logLoginFailed(account: string, reason: string): void {
  logActivity({ actorId: null, actorRole: 'user', action: 'auth.login_failed', targetType: 'account', targetId: clip(account, LIMITS.account), detail: { reason } });
}

// ---------- 查询 ----------
export type ActivityFilter = {
  scope?: 'all' | 'user' | 'admin';
  user?: string;
  action?: string; // 具体动作代码，或分组 'auth.*'
  from?: number;
  to?: number;
  ip?: string;
};

export type ActivityEntry = {
  id: number;
  actorId: number | null;
  actorRole: ActorRole;
  actorName: string;
  actorEmail: string;
  action: string;
  actionLabel: string;
  targetType: string;
  targetId: string;
  ip: string;
  userAgent: string;
  detail: string;
  createdAt: number;
};

function whereFor(filter: ActivityFilter): { sql: string; args: (string | number)[] } {
  const parts: string[] = [];
  const args: (string | number)[] = [];
  if (filter.scope === 'admin') parts.push("l.actor_role = 'admin'");
  else if (filter.scope === 'user') parts.push("l.actor_role <> 'admin'");
  const user = (filter.user ?? '').trim();
  if (user) {
    const like = `%${user.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
    const id = /^#?\d+$/.test(user) ? Number(user.replace('#', '')) : -1;
    parts.push("(l.actor_id = ? OR u.nickname LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR (l.target_type IN ('account','user') AND (l.target_id LIKE ? ESCAPE '\\' OR l.target_id = ?)))");
    args.push(id, like, like, like, String(id));
  }
  const action = (filter.action ?? '').trim();
  if (action && action !== 'all') {
    const group = action.endsWith('.*') ? ACTION_GROUPS.find((g) => g.id === action.slice(0, -2)) : undefined;
    if (group) {
      parts.push('(' + group.prefixes.map(() => 'l.action LIKE ?').join(' OR ') + ')');
      args.push(...group.prefixes.map((p) => `${p}%`));
    } else {
      parts.push('l.action = ?');
      args.push(action);
    }
  }
  if (filter.from && Number.isFinite(filter.from)) { parts.push('l.created_at >= ?'); args.push(filter.from); }
  if (filter.to && Number.isFinite(filter.to)) { parts.push('l.created_at <= ?'); args.push(filter.to); }
  const ip = (filter.ip ?? '').trim();
  if (ip) { parts.push('l.ip LIKE ?'); args.push(`${ip}%`); }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args };
}

// 查询参数 → 筛选条件。from/to 是 YYYY-MM-DD，按看的人的时区（cookie tavern_tz，没有则平台时区）取整天
export type FilterParams = { scope?: string; user?: string; action?: string; from?: string; to?: string; ip?: string };
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayStart(key: string, tz: string): number | undefined {
  const m = key.match(DAY);
  if (!m) return undefined;
  return startOfDayIn(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12), tz);
}
export function parseFilter(params: FilterParams, tz?: string | null): ActivityFilter {
  let zone = PLATFORM_TZ;
  if (tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); zone = tz; } catch { /* 用平台时区 */ } }
  const scope = params.scope === 'user' || params.scope === 'admin' ? params.scope : 'all';
  const from = params.from ? dayStart(params.from, zone) : undefined;
  const toStart = params.to ? dayStart(params.to, zone) : undefined;
  return {
    scope,
    user: clip(params.user ?? '', 80),
    action: clip(params.action ?? '', 64),
    from,
    to: toStart === undefined ? undefined : toStart + 86400000 - 1,
    ip: clip(params.ip ?? '', 64),
  };
}

export function countActivity(filter: ActivityFilter = {}): number {
  ensureSchema();
  const w = whereFor(filter);
  return (db.prepare(`SELECT COUNT(*) AS count FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id ${w.sql}`).get(...w.args) as { count: number }).count;
}

export function listActivity(filter: ActivityFilter = {}, limit = 30, offset = 0): ActivityEntry[] {
  ensureSchema();
  const w = whereFor(filter);
  const rows = db.prepare(`
        SELECT l.*, u.nickname, u.email FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id
        ${w.sql} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?
    `).all(...w.args, limit, offset) as {
    id: number; actor_id: number | null; actor_role: string; action: string; target_type: string; target_id: string;
    ip: string; user_agent: string; detail: string; created_at: number; nickname: string | null; email: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role === 'admin' ? 'admin' : row.actor_role === 'system' ? 'system' : 'user',
    actorName: row.actor_id == null ? (row.actor_role === 'system' ? '系统' : '未登录访客') : row.nickname ?? '已删除用户',
    actorEmail: row.email ?? '',
    action: row.action,
    actionLabel: actionLabel(row.action),
    targetType: row.target_type,
    targetId: row.target_id,
    ip: row.ip,
    userAgent: row.user_agent,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

// 埋点用的小查询：只取归属，不拿内容
export function orderOwner(orderId: number): number | null {
  try { return (db.prepare('SELECT user_id FROM orders WHERE id = ?').get(orderId) as { user_id: number } | undefined)?.user_id ?? null; } catch { return null; }
}
export function commentOwner(commentId: number): number | null {
  try { return (db.prepare('SELECT user_id FROM comments WHERE id = ?').get(commentId) as { user_id: number } | undefined)?.user_id ?? null; } catch { return null; }
}

// 兼容旧调用
export function countAudit(): number { return countActivity(); }

// ---------- CSV ----------
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // 防公式注入：以 = + - @ 开头的单元格加前缀
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function activityCsv(entries: ActivityEntry[], headers: string[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const e of entries) {
    lines.push([
      new Date(e.createdAt).toISOString(), e.actorRole, e.actorId ?? '', e.actorName, e.action, e.actionLabel,
      e.targetType ? `${e.targetType}:${e.targetId}` : '', e.ip, e.userAgent, e.detail,
    ].map(csvCell).join(','));
  }
  return '\ufeff' + lines.join('\r\n');
}
