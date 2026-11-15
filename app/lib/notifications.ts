import db from '@/lib/db';
import { pushToUser } from '@/lib/web-push';

// M4 站内通知：点数、后台操作等事件写一条；顶栏铃铛显示未读数。
export type Notification = { id: number; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: number };

type Row = { id: number; type: string; title: string; body: string; link: string | null; read_at: number | null; created_at: number };

// push：同时发系统推送（用户开了 PWA 推送才会真的发）。用户自己刚触发、正看着页面的事件传 false。
export function notify(userId: number, input: { type: string; title: string; body?: string; link?: string | null; push?: boolean }): number {
  const result = db.prepare('INSERT INTO notifications (user_id, type, title, body, link, created_at) VALUES (?,?,?,?,?,?)').run(
    userId,
    input.type,
    input.title.slice(0, 80),
    input.body ?? '',
    input.link ?? null,
    Date.now(),
  );
  if (input.push !== false) {
    // 放到下一轮事件循环，避免在调用方的事务里等网络
    setImmediate(() => { void pushToUser(userId, { title: input.title.slice(0, 80), body: input.body, link: input.link, tag: input.type }).catch(() => {}); });
  }
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
