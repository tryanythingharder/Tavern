import db from '@/lib/db';

// M4 站内通知：点数、后台操作等事件写一条；顶栏铃铛显示未读数。
export type Notification = { id: number; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: number };

type Row = { id: number; type: string; title: string; body: string; link: string | null; read_at: number | null; created_at: number };

export function notify(userId: number, input: { type: string; title: string; body?: string; link?: string | null }): number {
  const result = db.prepare('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)').run(
    userId,
    input.type,
    input.title.slice(0, 80),
    input.body ?? '',
    input.link ?? null,
    Date.now(),
  );
  return Number(result.lastInsertRowid);
}

export function listNotifications(userId: number, limit = 50): Notification[] {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as Row[];
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read_at !== null,
    createdAt: row.created_at,
  }));
}

export function unreadCount(userId: number): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as { count: number };
  return row.count;
}

export function markAllRead(userId: number): void {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), userId);
}
