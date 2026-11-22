import db from '@/lib/db';
import { NO_AUTO, normalizeAuto, normalizeItem, type QrItem, type QrSet, type QrState } from '@/lib/quick-replies';

// 快捷回复集（ST Quick Reply v2）。旧表 quick_replies 加 set_id 等列，旧数据第一次读取时归进「我的快捷回复」集。
db.exec(`CREATE TABLE IF NOT EXISTS quick_reply_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    disable_send INTEGER NOT NULL DEFAULT 0,
    place_before_input INTEGER NOT NULL DEFAULT 0,
    inject_input INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL DEFAULT '',
    only_border_color INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_sets_user ON quick_reply_sets(user_id, sort);`);

function addColumn(table: string, column: string, ddl: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('quick_replies', 'set_id', 'INTEGER');
addColumn('quick_replies', 'title', "TEXT NOT NULL DEFAULT ''");
addColumn('quick_replies', 'is_hidden', 'INTEGER NOT NULL DEFAULT 0');
addColumn('quick_replies', 'auto', 'TEXT');
addColumn('quick_replies', 'context', 'TEXT');
// 全局启用的集（NULL = 全部）；聊天 / 群聊额外启用的集（ST chat quick reply sets）
addColumn('users', 'qr_global_sets', 'TEXT');
addColumn('chats', 'qr_sets', 'TEXT');
addColumn('rooms', 'qr_sets', 'TEXT');

type SetRow = { id: number; name: string; disable_send: number; place_before_input: number; inject_input: number; color: string; only_border_color: number };
type ReplyRow = { id: number; set_id: number; label: string; title: string | null; content: string; is_hidden: number; auto: string | null; context: string | null };

const parse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const ids = (value: unknown): number[] => (Array.isArray(value) ? [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))] : []);

function migrateLegacy(userId: number) {
  const loose = db.prepare('SELECT COUNT(*) AS n FROM quick_replies WHERE user_id = ? AND set_id IS NULL').get(userId) as { n: number };
  if (!loose.n) return;
  const now = Date.now();
  const result = db.prepare('INSERT INTO quick_reply_sets (user_id, name, disable_send, sort, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(userId, '我的快捷回复', 1, 0, now, now);
  // 旧版按钮是「填进输入框」，迁移后保持原样
  db.prepare('UPDATE quick_replies SET set_id = ? WHERE user_id = ? AND set_id IS NULL').run(Number(result.lastInsertRowid), userId);
}

export function listQrSets(userId: number): QrSet[] {
  migrateLegacy(userId);
  const sets = db.prepare('SELECT * FROM quick_reply_sets WHERE user_id = ? ORDER BY sort, id').all(userId) as SetRow[];
  const replies = db.prepare('SELECT id, set_id, label, title, content, is_hidden, auto, context FROM quick_replies WHERE user_id = ? AND set_id IS NOT NULL ORDER BY sort, id').all(userId) as ReplyRow[];
  return sets.map((row) => ({
    id: row.id,
    name: row.name,
    disableSend: !!row.disable_send,
    placeBeforeInput: !!row.place_before_input,
    injectInput: !!row.inject_input,
    color: row.color || '',
    onlyBorderColor: !!row.only_border_color,
    replies: replies
      .filter((reply) => reply.set_id === row.id)
      .map((reply): QrItem => ({
        id: reply.id,
        label: reply.label,
        title: reply.title ?? '',
        message: reply.content,
        hidden: !!reply.is_hidden,
        auto: reply.auto ? normalizeAuto(parse(reply.auto, NO_AUTO)) : { ...NO_AUTO },
        preventAuto: (parse(reply.auto, {}) as { preventAuto?: boolean }).preventAuto !== false,
        context: normalizeItem({ context: parse(reply.context, []) }).context,
      })),
  }));
}

export function getQrSet(userId: number, setId: number): QrSet | null {
  return listQrSets(userId).find((set) => set.id === setId) ?? null;
}

export type QrSetInput = Partial<Omit<QrSet, 'id' | 'replies'>> & { replies?: unknown[] };

export function createQrSet(userId: number, input: QrSetInput): QrSet {
  const now = Date.now();
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM quick_reply_sets WHERE user_id = ?').get(userId) as { next: number }).next;
  const result = db.prepare('INSERT INTO quick_reply_sets (user_id, name, sort, created_at, updated_at) VALUES (?,?,?,?,?)').run(userId, '新快捷回复集', sort, now, now);
  const id = Number(result.lastInsertRowid);
  updateQrSet(userId, id, { replies: [], ...input });
  // 新集默认全局启用（全局列表是显式的才追加）
  const globals = getGlobalQrSets(userId);
  if (globals) setGlobalQrSets(userId, [...globals, id]);
  return getQrSet(userId, id) as QrSet;
}

export function updateQrSet(userId: number, setId: number, input: QrSetInput): QrSet | null {
  const row = db.prepare('SELECT id FROM quick_reply_sets WHERE id = ? AND user_id = ?').get(setId, userId);
  if (!row) return null;
  const fields: [string, unknown][] = [];
  if (input.name !== undefined) fields.push(['name', String(input.name).trim().slice(0, 80) || '未命名']);
  if (input.disableSend !== undefined) fields.push(['disable_send', input.disableSend ? 1 : 0]);
  if (input.placeBeforeInput !== undefined) fields.push(['place_before_input', input.placeBeforeInput ? 1 : 0]);
  if (input.injectInput !== undefined) fields.push(['inject_input', input.injectInput ? 1 : 0]);
  if (input.color !== undefined) fields.push(['color', /^#[0-9a-f]{3,8}$/i.test(String(input.color)) ? String(input.color) : '']);
  if (input.onlyBorderColor !== undefined) fields.push(['only_border_color', input.onlyBorderColor ? 1 : 0]);
  fields.push(['updated_at', Date.now()]);
  db.prepare(`UPDATE quick_reply_sets SET ${fields.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ? AND user_id = ?`).run(...(fields.map(([, value]) => value) as never[]), setId, userId);
  if (Array.isArray(input.replies)) {
    const existing = new Set((db.prepare('SELECT id FROM quick_replies WHERE set_id = ? AND user_id = ?').all(setId, userId) as { id: number }[]).map((item) => item.id));
    const keep = new Set<number>();
    const update = db.prepare('UPDATE quick_replies SET label = ?, title = ?, content = ?, is_hidden = ?, auto = ?, context = ?, sort = ? WHERE id = ? AND user_id = ?');
    const insert = db.prepare('INSERT INTO quick_replies (user_id, set_id, label, title, content, is_hidden, auto, context, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    input.replies.slice(0, 200).forEach((raw, index) => {
      const item = normalizeItem(raw, index);
      const values = [item.label, item.title, item.message, item.hidden ? 1 : 0, JSON.stringify({ ...item.auto, preventAuto: item.preventAuto }), JSON.stringify(item.context), index] as const;
      if (item.id && existing.has(item.id)) {
        update.run(...values, item.id, userId);
        keep.add(item.id);
      } else {
        insert.run(userId, setId, ...values, Date.now());
      }
    });
    const drop = db.prepare('DELETE FROM quick_replies WHERE id = ? AND user_id = ?');
    for (const id of existing) if (!keep.has(id)) drop.run(id, userId);
  }
  return getQrSet(userId, setId);
}

export function deleteQrSet(userId: number, setId: number): boolean {
  const changed = Number(db.prepare('DELETE FROM quick_reply_sets WHERE id = ? AND user_id = ?').run(setId, userId).changes) > 0;
  if (!changed) return false;
  db.prepare('DELETE FROM quick_replies WHERE set_id = ? AND user_id = ?').run(setId, userId);
  const globals = getGlobalQrSets(userId);
  if (globals) setGlobalQrSets(userId, globals.filter((id) => id !== setId));
  return true;
}

export function getGlobalQrSets(userId: number): number[] | null {
  const row = db.prepare('SELECT qr_global_sets FROM users WHERE id = ?').get(userId) as { qr_global_sets: string | null } | undefined;
  return row?.qr_global_sets ? ids(parse(row.qr_global_sets, [])) : null;
}

export function setGlobalQrSets(userId: number, setIds: number[] | null) {
  db.prepare('UPDATE users SET qr_global_sets = ? WHERE id = ?').run(setIds ? JSON.stringify(ids(setIds)) : null, userId);
}

type Scope = { chatId: number } | { roomId: number };

export function getScopeQrSets(userId: number, scope: Scope): number[] {
  const row = 'chatId' in scope
    ? (db.prepare('SELECT qr_sets FROM chats WHERE id = ? AND user_id = ?').get(scope.chatId, userId) as { qr_sets: string | null } | undefined)
    : (db.prepare('SELECT qr_sets FROM rooms WHERE id = ? AND user_id = ?').get(scope.roomId, userId) as { qr_sets: string | null } | undefined);
  return ids(parse(row?.qr_sets, []));
}

export function setScopeQrSets(userId: number, scope: Scope, setIds: number[]): boolean {
  const value = JSON.stringify(ids(setIds));
  const result = 'chatId' in scope
    ? db.prepare('UPDATE chats SET qr_sets = ? WHERE id = ? AND user_id = ?').run(value, scope.chatId, userId)
    : db.prepare('UPDATE rooms SET qr_sets = ? WHERE id = ? AND user_id = ?').run(value, scope.roomId, userId);
  return Number(result.changes) > 0;
}

/** 对话页要的：全部集（开关菜单要列出）+ 全局启用的 + 本聊天额外启用的；按钮栏显示 全局 ∪ 本聊天 */
export function qrState(userId: number, scope?: Scope): QrState {
  const sets = listQrSets(userId);
  const globals = getGlobalQrSets(userId);
  const globalIds = globals ? globals.filter((id) => sets.some((set) => set.id === id)) : sets.map((set) => set.id);
  const scopeIds = scope ? getScopeQrSets(userId, scope).filter((id) => sets.some((set) => set.id === id)) : [];
  return { sets, globalIds, scopeIds };
}
