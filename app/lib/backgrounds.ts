import db from '@/lib/db';

// 聊天背景（对齐 ST Backgrounds）：每个人一个背景库；全局默认背景（users.chat_bg_image）+ 单个会话/群聊锁定背景（chats/rooms.background）。
// 会话的值：NULL = 跟随默认；'' = 这段故事不要背景；其它 = 图片地址。
db.exec(`CREATE TABLE IF NOT EXISTS backgrounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  src TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bg_owner ON backgrounds(owner_id);`);
for (const [table, column] of [['users', 'chat_bg_image'], ['chats', 'background'], ['rooms', 'background']] as const) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((col) => col.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT`);
}

export type Background = { id: number; name: string; src: string };
export const MAX_BACKGROUNDS = 100;

export function listBackgrounds(ownerId: number): Background[] {
  return db.prepare('SELECT id, name, src FROM backgrounds WHERE owner_id = ? ORDER BY id DESC').all(ownerId) as Background[];
}
export function addBackground(ownerId: number, name: string, src: string): void {
  db.prepare('INSERT INTO backgrounds (owner_id, name, src, created_at) VALUES (?,?,?,?)').run(ownerId, name.slice(0, 80), src, Date.now());
}
export function deleteBackground(ownerId: number, id: number): boolean {
  const row = db.prepare('SELECT src FROM backgrounds WHERE id = ? AND owner_id = ?').get(id, ownerId) as { src: string } | undefined;
  if (!row) return false;
  db.prepare('DELETE FROM backgrounds WHERE id = ?').run(id);
  // 用着这张的默认/会话改回「跟随默认」
  db.prepare('UPDATE users SET chat_bg_image = NULL WHERE id = ? AND chat_bg_image = ?').run(ownerId, row.src);
  db.prepare('UPDATE chats SET background = NULL WHERE user_id = ? AND background = ?').run(ownerId, row.src);
  db.prepare('UPDATE rooms SET background = NULL WHERE user_id = ? AND background = ?').run(ownerId, row.src);
  return true;
}
export function renameBackground(ownerId: number, id: number, name: string): boolean {
  return Number(db.prepare('UPDATE backgrounds SET name = ? WHERE id = ? AND owner_id = ?').run(name.slice(0, 80), id, ownerId).changes) > 0;
}

/** 只能设成自己库里的图（或空） */
export function ownsBackground(ownerId: number, src: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM backgrounds WHERE owner_id = ? AND src = ?').get(ownerId, src));
}
export function globalBackground(userId: number): string | null {
  return ((db.prepare('SELECT chat_bg_image FROM users WHERE id = ?').get(userId) as { chat_bg_image: string | null } | undefined)?.chat_bg_image) || null;
}
export function setGlobalBackground(userId: number, src: string | null): void {
  db.prepare('UPDATE users SET chat_bg_image = ? WHERE id = ?').run(src || null, userId);
}
export function setThreadBackground(kind: 'chat' | 'room', id: number, userId: number, value: string | null): boolean {
  const table = kind === 'chat' ? 'chats' : 'rooms';
  return Number(db.prepare(`UPDATE ${table} SET background = ? WHERE id = ? AND user_id = ?`).run(value, id, userId).changes) > 0;
}
export function threadBackground(kind: 'chat' | 'room', id: number): string | null {
  const table = kind === 'chat' ? 'chats' : 'rooms';
  return ((db.prepare(`SELECT background FROM ${table} WHERE id = ?`).get(id) as { background: string | null } | undefined)?.background) ?? null;
}

/** 给页面用：当前生效的背景 + 是否锁定在这段故事 */
export function resolveBackground(kind: 'chat' | 'room', id: number, userId: number): { src: string | null; locked: boolean; value: string | null } {
  const value = threadBackground(kind, id);
  if (value !== null) return { src: value || null, locked: true, value };
  return { src: globalBackground(userId), locked: false, value };
}
