import db from '@/lib/db';

// 后台操作留痕：只记管理员、动作和简短描述，不记录密钥
export function logAdmin(adminId: number, action: string, detail = ''): void {
  db.prepare('INSERT INTO audit_log (admin_id, action, detail, created_at) VALUES (?,?,?,?)').run(adminId, action.slice(0, 60), detail.slice(0, 300), Date.now());
}

export function countAudit(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as { count: number }).count;
}

export type AuditEntry = { id: number; adminId: number; adminName: string; action: string; detail: string; createdAt: number };

export function listAudit(limit = 20, offset = 0): AuditEntry[] {
  const rows = db.prepare(`
        SELECT a.*, u.nickname FROM audit_log a LEFT JOIN users u ON u.id = a.admin_id
        ORDER BY a.id DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as { id: number; admin_id: number; action: string; detail: string; created_at: number; nickname: string | null }[];
  return rows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: row.nickname ?? '已删除管理员',
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
