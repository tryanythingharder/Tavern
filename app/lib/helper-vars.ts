import db from '@/lib/db';

// 酒馆助手脚本的变量表（chat / character / global / script 四种，按玩家隔离）。
// message 楼层变量不在这里：读取走 MVU 重放（lib/mvu-server.ts），脚本改楼层变量只在本次会话里生效。
//   chat       scope_id = 会话 id
//   character  scope_id = 角色 id（初始值 = 卡里 tavern_helper.variables）
//   global     scope_id = ''
//   script     scope_id = 角色 id + ':' + 脚本 id（初始值 = 脚本自带 data）
export type HelperScope = 'chat' | 'character' | 'global' | 'script';
export const HELPER_SCOPES: HelperScope[] = ['chat', 'character', 'global', 'script'];
export const MAX_VARS_BYTES = 256 * 1024;

db.exec(`
  CREATE TABLE IF NOT EXISTS helper_vars (
    user_id INTEGER NOT NULL,
    scope TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, scope, scope_id)
  );
`);

type Obj = Record<string, unknown>;

export function readHelperVars(userId: number, scope: HelperScope, scopeId: string): Obj | null {
  const row = db.prepare('SELECT data FROM helper_vars WHERE user_id = ? AND scope = ? AND scope_id = ?').get(userId, scope, scopeId) as { data: string } | undefined;
  if (!row) return null;
  try {
    const value = JSON.parse(row.data) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
  } catch {
    return {};
  }
}

export function writeHelperVars(userId: number, scope: HelperScope, scopeId: string, data: Obj): boolean {
  const text = JSON.stringify(data ?? {});
  if (text.length > MAX_VARS_BYTES) return false;
  db.prepare(
    `INSERT INTO helper_vars (user_id, scope, scope_id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, scope, scope_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, scope, scopeId, text, Date.now());
  return true;
}

export function deleteChatHelperVars(userId: number, chatId: number): void {
  db.prepare("DELETE FROM helper_vars WHERE user_id = ? AND scope = 'chat' AND scope_id = ?").run(userId, String(chatId));
}
