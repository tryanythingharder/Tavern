import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { characters } from '@/data/characters';

// M1 用 Node 内置 SQLite（node:sqlite，零依赖）。换成 Postgres 时只替换这个文件的实现，
// 表结构与查询语义保持一致（见 prototype/IMPLEMENTATION-PLAN.md §4）。
const dir = join(process.cwd(), '.data');
mkdirSync(dir, { recursive: true });

// next build 会并行导入路由模块收集页面数据，多个进程同时初始化 SQLite 会互相抢写锁。
// 构建阶段用内存库跑同一套建表逻辑（所有页面都是动态渲染，构建期不读真实数据）。
const building = process.env.NEXT_PHASE === 'phase-production-build';
const db = new DatabaseSync(building ? ':memory:' : join(dir, 'tavern.db'));

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
    -- 邮箱验证 / 找回密码的一次性令牌
    CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
    );

    -- 后台审计日志：赠点、封禁、订单确认、配置修改等
    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );

    -- 邀请码：管理员生成，注册时可填
    CREATE TABLE IF NOT EXISTS invite_codes (
        code TEXT PRIMARY KEY,
        created_by INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        used_by INTEGER,
        created_at INTEGER NOT NULL,
        used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT NOT NULL,
        initial TEXT NOT NULL,
        hue INTEGER NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL,
        nsfw INTEGER NOT NULL,
        chats TEXT NOT NULL,
        greeting TEXT NOT NULL,
        hook TEXT NOT NULL,
        description TEXT NOT NULL,
        pace TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        character_id TEXT NOT NULL,
        title TEXT NOT NULL,
        branch_from_chat_id INTEGER,
        branch_from_message_id INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        candidates TEXT,
        selected INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
    CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id, updated_at DESC);

    -- 每次生成一行：先写 pending（用于限流计数），结束后回填 token 与状态。
    CREATE TABLE IF NOT EXISTS generation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        chat_id INTEGER,
        kind TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL,
        finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_generation_user_time ON generation_events(user_id, created_at DESC);

    -- M2 设定系统：预设 / 世界书 / 正则 / 身份 / 快捷回复
    CREATE TABLE IF NOT EXISTS presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        system TEXT NOT NULL DEFAULT '',
        jailbreak TEXT NOT NULL DEFAULT '',
        params TEXT NOT NULL,
        context_template TEXT NOT NULL,
        instruct TEXT NOT NULL,
        prompt_order TEXT NOT NULL,
        forbid_overrides INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lorebooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        entries TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS regex_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        find TEXT NOT NULL,
        replacement TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT 'both',
        target TEXT NOT NULL DEFAULT 'all',
        enabled INTEGER NOT NULL DEFAULT 1,
        depth_from INTEGER,
        depth_to INTEGER,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS personas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position TEXT NOT NULL DEFAULT 'prompt',
        depth INTEGER NOT NULL DEFAULT 2,
        role TEXT NOT NULL DEFAULT 'system',
        bound_characters TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quick_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        content TEXT NOT NULL,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_presets_user ON presets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lorebooks_user ON lorebooks(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_regex_user ON regex_rules(user_id, sort);
    CREATE INDEX IF NOT EXISTS idx_personas_user ON personas(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON quick_replies(user_id, sort);

    -- M3 长线能力：聊天备份（自动快照，每个会话保留最近 5 份）
    CREATE TABLE IF NOT EXISTS chat_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        message_count INTEGER NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_backups_chat ON chat_backups(chat_id, created_at DESC);

    -- M3 角色卡覆盖：同一个种子角色，每个用户可以有自己的卡内提示词（对应 ST 的 system_prompt / post_history_instructions / mes_example / depth_prompt）
    -- M4 房间/群聊：多个角色共享一段对话
    CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        character_ids TEXT NOT NULL DEFAULT '[]',
        muted TEXT NOT NULL DEFAULT '[]',
        strategy TEXT NOT NULL DEFAULT 'natural',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS room_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        speaker_id TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rooms_user ON rooms(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_room_messages ON room_messages(room_id, id);

    -- M4 点数账本：每次生成记一笔负数，充值/赠送记正数，balance_after 用于对账
    CREATE TABLE IF NOT EXISTS points_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        ref_id TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id, id DESC);

    -- M4 通知
    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        link TEXT,
        read_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id DESC);

    -- M4 充值：兑换码与订单（支付网关未接时由管理员手动确认）
    CREATE TABLE IF NOT EXISTS redeem_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_by INTEGER,
        used_by INTEGER,
        used_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        points INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        provider TEXT NOT NULL DEFAULT 'manual',
        provider_order_id TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS idx_codes_used ON redeem_codes(used_at);

    -- M4 审核：举报与处理
    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        handled_by INTEGER,
        handled_at INTEGER,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, id DESC);

    -- M5 评论（角色页）
    CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'visible',
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_character ON comments(character_id, id DESC);

    -- 运行时配置（生图 / TTS / 支付），优先于环境变量；密钥只写不读
    -- 每日签到（按本地日期唯一，连续天数用于加成）
    CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        streak INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, day)
    );

    -- 上游文本渠道：可配置多条，按优先级依次 failover（类似 new-api 的渠道）
    CREATE TABLE IF NOT EXISTS model_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        models TEXT NOT NULL DEFAULT '[]',
        default_model TEXT NOT NULL DEFAULT '',
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_test_at INTEGER,
        last_test_ok INTEGER,
        last_test_note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );

    -- 登录/注册/找回密码的滑动窗口限流（单实例 SQLite，重启后保留窗口）
    CREATE TABLE IF NOT EXISTS rate_limits (
        key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
    );

    -- 媒体文件归属：角色封面/形象为 public；聊天生图/语音为 private，只有本人可读
    CREATE TABLE IF NOT EXISTS media_files (
        name TEXT PRIMARY KEY,
        owner_id INTEGER,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_owner ON media_files(owner_id);

    -- 收藏（角色库）
    -- 作品版本（每次保存前留一版，最多 5 版）
    CREATE TABLE IF NOT EXISTS character_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_character_versions ON character_versions(character_id, id DESC);

    CREATE TABLE IF NOT EXISTS character_favorites (
        user_id INTEGER NOT NULL,
        character_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, character_id)
    );

    -- 角色库「已添加」：和收藏分开，添加后可在角色库快速找到
    CREATE TABLE IF NOT EXISTS character_added (
        user_id INTEGER NOT NULL,
        character_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, character_id)
    );

    CREATE TABLE IF NOT EXISTS character_overrides (
        user_id INTEGER NOT NULL,
        character_id TEXT NOT NULL,
        system_prompt TEXT NOT NULL DEFAULT '',
        post_history TEXT NOT NULL DEFAULT '',
        mes_example TEXT NOT NULL DEFAULT '',
        depth_prompt TEXT NOT NULL DEFAULT '',
        depth_depth INTEGER NOT NULL DEFAULT 4,
        depth_role TEXT NOT NULL DEFAULT 'system',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, character_id)
    );
`);

// 旧库补列：M1 后半段加了候选与分支来源。SQLite 的 ADD COLUMN 带默认值是安全的。
function ensureColumn(table: string, column: string, ddl: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
ensureColumn('messages', 'candidates', 'TEXT');
ensureColumn('messages', 'selected', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('chats', 'branch_from_chat_id', 'INTEGER');
ensureColumn('chats', 'branch_from_message_id', 'INTEGER');
ensureColumn('chats', 'preset_id', 'INTEGER');
ensureColumn('rooms', 'model', 'TEXT');
ensureColumn('chats', 'persona_id', 'INTEGER');
ensureColumn('chats', 'lorebook_ids', 'TEXT');
ensureColumn('chats', 'summary', 'TEXT');
ensureColumn('chats', 'summary_prefs', 'TEXT');
ensureColumn('characters', 'review_note', 'TEXT');
ensureColumn('chats', 'rag_prefs', 'TEXT');
ensureColumn('chats', 'memory', 'TEXT');
ensureColumn('chats', 'model', 'TEXT');
ensureColumn('messages', 'bookmark', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('messages', 'attachment', 'TEXT');
ensureColumn('room_messages', 'attachment', 'TEXT');
ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'user'");
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'active'");
ensureColumn('users', 'age_confirmed_at', 'INTEGER');
ensureColumn('users', 'hide_nsfw', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'chat_font', 'INTEGER NOT NULL DEFAULT 100');
ensureColumn('users', 'chat_bg', "TEXT NOT NULL DEFAULT 'default'");
ensureColumn('users', 'author_bio', 'TEXT');
ensureColumn('users', 'email_verified_at', 'INTEGER');
ensureColumn('users', 'totp_secret', 'TEXT');
ensureColumn('users', 'totp_recovery', 'TEXT');
ensureColumn('users', 'totp_enabled_at', 'INTEGER');
// 跟账号走的界面偏好（语言、主题、玩法模式、外观），JSON
ensureColumn('users', 'ui_prefs', 'TEXT');
ensureColumn('sessions', 'created_at', 'INTEGER');
ensureColumn('sessions', 'user_agent', 'TEXT');
ensureColumn('sessions', 'ip', 'TEXT');
ensureColumn('auth_tokens', 'meta', 'TEXT');
ensureColumn('characters', 'owner_id', 'INTEGER');
ensureColumn('characters', 'status', "TEXT NOT NULL DEFAULT 'published'");
ensureColumn('characters', 'created_at', 'INTEGER');
ensureColumn('characters', 'alternate_greetings', 'TEXT');
// ST V2 卡的高级字段（personality / scenario / mes_example / system_prompt / post_history / creator_notes），JSON
ensureColumn('characters', 'card_fields', 'TEXT');
ensureColumn('characters', 'cover_image', 'TEXT');
ensureColumn('characters', 'avatar_image', 'TEXT');
ensureColumn('rooms', 'auto_mode', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('rooms', 'speaker_id', 'TEXT');

// 首次启动把种子角色写入数据库；之后以数据库为准。
const seeded = db.prepare('SELECT COUNT(*) AS count FROM characters').get() as { count: number };
if (!seeded.count) {
  const insert = db.prepare(`INSERT INTO characters (id,name,author,initial,hue,category,tags,nsfw,chats,greeting,hook,description,pace) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const character of characters) {
    insert.run(character.id, character.name, character.author, character.initial, character.hue, character.category, JSON.stringify(character.tags), character.nsfw ? 1 : 0, character.chats, character.greeting, character.hook, character.description, character.pace);
  }
}

// 种子角色没有创建时间：补一个固定日期，作者页的「加入于」才有内容
db.prepare("UPDATE characters SET created_at = ? WHERE owner_id IS NULL").run(new Date(2025, 7, 1).getTime());

export type DbCharacter = {
  id: string; name: string; author: string; initial: string; hue: number; category: string;
  tags: string; nsfw: number; chats: string; greeting: string; hook: string; description: string; pace: string;
  owner_id: number | null; status: string; created_at: number | null; alternate_greetings: string | null; cover_image: string | null; avatar_image: string | null; review_note: string | null;
  card_fields?: string | null;
};

export type DbChat = {
  id: number; user_id: number; character_id: string; title: string;
  branch_from_chat_id: number | null; branch_from_message_id: number | null;
  preset_id: number | null; persona_id: number | null; lorebook_ids: string | null;
  summary: string | null; summary_prefs: string | null; rag_prefs: string | null; memory: string | null;
  model?: string | null;
  created_at: number; updated_at: number;
};
export type DbMessage = {
  id: number; chat_id: number; role: 'user' | 'assistant' | 'system'; content: string;
  candidates: string | null; selected: number; bookmark: number; attachment: string | null; created_at: number;
};

export function getCharacterById(id: string): DbCharacter | undefined {
  return db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as DbCharacter | undefined;
}

export function listCharacters(): DbCharacter[] {
  return db.prepare('SELECT * FROM characters ORDER BY rowid').all() as DbCharacter[];
}

export function createChat(userId: number, characterId: string, title: string): number {
  const now = Date.now();
  const result = db.prepare('INSERT INTO chats (user_id, character_id, title, created_at, updated_at) VALUES (?,?,?,?,?)').run(userId, characterId, title, now, now);
  return Number(result.lastInsertRowid);
}

export function listChats(userId: number): (DbChat & { character_name: string; character_initial: string; character_hue: number; character_owner: number | null; last_message: string | null; last_message_id: number | null; message_count: number })[] {
  return db.prepare(`
        SELECT c.*, ch.name AS character_name, ch.initial AS character_initial, ch.hue AS character_hue, ch.owner_id AS character_owner,
               (SELECT content FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message,
               (SELECT id FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_id,
               (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) AS message_count
        FROM chats c JOIN characters ch ON ch.id = c.character_id
        WHERE c.user_id = ? ORDER BY c.updated_at DESC
    `).all(userId) as (DbChat & { character_name: string; character_initial: string; character_hue: number; character_owner: number | null; last_message: string | null; last_message_id: number | null; message_count: number })[];
}

export function getChat(chatId: number, userId: number): DbChat | undefined {
  return db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId) as DbChat | undefined;
}

export function renameChat(chatId: number, userId: number, title: string): boolean {
  const result = db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, Date.now(), chatId, userId);
  return result.changes > 0;
}

// 删除会话：消息与备份一起清掉，其他会话的分支来源指向置空
export function deleteChat(chatId: number, userId: number): boolean {
  if (!getChat(chatId, userId)) return false;
  db.prepare('DELETE FROM messages WHERE chat_id = ?').run(chatId);
  db.prepare('DELETE FROM chat_backups WHERE chat_id = ?').run(chatId);
  db.prepare('UPDATE chats SET branch_from_chat_id = NULL WHERE branch_from_chat_id = ?').run(chatId);
  db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(chatId, userId);
  return true;
}

export function listMessages(chatId: number, limit = 200): DbMessage[] {
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').all(chatId, limit) as DbMessage[];
  return rows.reverse();
}

// 聊天分页：before 为空取最后一页；hasMore 表示这一页之前是否还有更早的消息。
export function listMessagesPage(chatId: number, beforeId: number | null, limit = 60): { messages: DbMessage[]; hasMore: boolean } {
  const size = Math.min(100, Math.max(1, Math.round(limit)));
  const rows = beforeId
    ? db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(chatId, beforeId, size) as DbMessage[]
    : db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?').all(chatId, size) as DbMessage[];
  const messages = rows.reverse();
  const first = messages[0];
  const hasMore = first ? Boolean(db.prepare('SELECT 1 AS ok FROM messages WHERE chat_id = ? AND id < ? LIMIT 1').get(chatId, first.id)) : false;
  return { messages, hasMore };
}

// 重新生成某条消息时，上下文只取它之前的消息（不含它本身）。
export function listMessagesBefore(chatId: number, messageId: number, limit = 200): DbMessage[] {
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(chatId, messageId, limit) as DbMessage[];
  return rows.reverse();
}

export function addMessage(chatId: number, role: DbMessage['role'], content: string, candidates?: string[], selectedIndex?: number): DbMessage {
  const now = Date.now();
  const list = candidates?.length ? JSON.stringify(candidates) : null;
  const selected = list ? Math.min(Math.max(selectedIndex ?? candidates!.length - 1, 0), candidates!.length - 1) : 0;
  const result = db.prepare('INSERT INTO messages (chat_id, role, content, candidates, selected, created_at) VALUES (?,?,?,?,?,?)').run(chatId, role, content, list, selected, now);
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);
  return { id: Number(result.lastInsertRowid), chat_id: chatId, role, content, candidates: list, selected, bookmark: 0, attachment: null, created_at: now };
}

export function touchChat(chatId: number) {
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), chatId);
}

export function getMessage(messageId: number): DbMessage | undefined {
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as DbMessage | undefined;
}

// 所有消息操作都必须经过归属校验：消息所属会话属于当前用户。
export function getOwnedMessage(messageId: number, userId: number): DbMessage | undefined {
  return db.prepare(`
        SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id
        WHERE m.id = ? AND c.user_id = ?
    `).get(messageId, userId) as DbMessage | undefined;
}

export function messageCandidates(message: { candidates: string | null }): string[] {
  if (!message.candidates) return [];
  try {
    const list = JSON.parse(message.candidates);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export function updateMessageContent(messageId: number, content: string): DbMessage | undefined {
  const row = getMessage(messageId);
  if (!row) return undefined;
  const list = messageCandidates(row);
  if (list.length) {
    // 编辑的是当前选中的候选，其他候选保持不变
    list[Math.min(row.selected, list.length - 1)] = content;
    db.prepare('UPDATE messages SET content = ?, candidates = ? WHERE id = ?').run(content, JSON.stringify(list), messageId);
  } else {
    db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId);
  }
  touchChat(row.chat_id);
  return getMessage(messageId);
}

export function setMessageAttachment(messageId: number, attachment: string | null): DbMessage | undefined {
  const row = getMessage(messageId);
  if (!row) return undefined;
  db.prepare('UPDATE messages SET attachment = ? WHERE id = ?').run(attachment, messageId);
  return getMessage(messageId);
}

export function deleteMessage(messageId: number): boolean {
  const row = getMessage(messageId);
  if (!row) return false;
  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  touchChat(row.chat_id);
  return true;
}

export function appendCandidate(messageId: number, text: string): { index: number; count: number } | null {
  const row = getMessage(messageId);
  if (!row) return null;
  const list = messageCandidates(row);
  // 开场白这类没有候选列表的消息：把原内容当作第 1 个候选保留下来
  if (!list.length && row.content.trim()) list.push(row.content);
  list.push(text);
  const index = list.length - 1;
  db.prepare('UPDATE messages SET content = ?, candidates = ?, selected = ? WHERE id = ?').run(text, JSON.stringify(list), index, messageId);
  touchChat(row.chat_id);
  return { index, count: list.length };
}

export function selectCandidate(messageId: number, index: number): { index: number; count: number; content: string } | null {
  const row = getMessage(messageId);
  if (!row) return null;
  const list = messageCandidates(row);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return null;
  db.prepare('UPDATE messages SET content = ?, selected = ? WHERE id = ?').run(list[index], index, messageId);
  touchChat(row.chat_id);
  return { index, count: list.length, content: list[index] };
}

// 从某条消息分支：新会话复制到这条（含）为止的消息，原会话不动。
export function branchChat(chatId: number, userId: number, messageId: number): { id: number; title: string } | null {
  const source = getChat(chatId, userId);
  if (!source) return null;
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id <= ? ORDER BY id').all(chatId, messageId) as DbMessage[];
  if (!rows.length || rows[rows.length - 1].id !== messageId) return null;

  const now = Date.now();
  const title = `${source.title}（分支）`;
  const result = db.prepare('INSERT INTO chats (user_id, character_id, title, branch_from_chat_id, branch_from_message_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(userId, source.character_id, title, chatId, messageId, now, now);
  const newId = Number(result.lastInsertRowid);
  const insert = db.prepare('INSERT INTO messages (chat_id, role, content, candidates, selected, created_at) VALUES (?,?,?,?,?,?)');
  for (const row of rows) insert.run(newId, row.role, row.content, row.candidates, row.selected, row.created_at);
  return { id: newId, title };
}

// ---------- 生成计量 ----------

export type GenerationStatus = 'pending' | 'done' | 'aborted' | 'error';

export function startGeneration(userId: number, chatId: number | null, kind: 'send' | 'regenerate' | 'room' | 'image' | 'tts', model: string): number {
  const result = db.prepare('INSERT INTO generation_events (user_id, chat_id, kind, model, status, created_at) VALUES (?,?,?,?,?,?)').run(userId, chatId, kind, model, 'pending', Date.now());
  return Number(result.lastInsertRowid);
}

export function finishGeneration(
  id: number,
  patch: { status: GenerationStatus; promptTokens?: number; completionTokens?: number; totalTokens?: number; estimated?: boolean; error?: string | null },
) {
  const promptTokens = patch.promptTokens ?? 0;
  const completionTokens = patch.completionTokens ?? 0;
  const totalTokens = patch.totalTokens ?? promptTokens + completionTokens;
  db.prepare(`
        UPDATE generation_events
        SET status = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, estimated = ?, error = ?, finished_at = ?
        WHERE id = ?
    `).run(patch.status, promptTokens, completionTokens, totalTokens, patch.estimated ? 1 : 0, patch.error ?? null, Date.now(), id);
}

export function countGenerationsSince(userId: number, since: number): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM generation_events WHERE user_id = ? AND created_at >= ?').get(userId, since) as { count: number };
  return row.count;
}

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function usageSummary(userId: number) {
  const since = startOfToday();
  const today = db.prepare(`
        SELECT COUNT(*) AS runs,
               COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
               COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
               COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM generation_events
        WHERE user_id = ? AND created_at >= ? AND status IN ('done', 'aborted')
    `).get(userId, since) as { runs: number; prompt_tokens: number; completion_tokens: number; total_tokens: number };
  const all = db.prepare(`
        SELECT COUNT(*) AS runs, COALESCE(SUM(total_tokens), 0) AS total_tokens
        FROM generation_events WHERE user_id = ? AND status IN ('done', 'aborted')
    `).get(userId) as { runs: number; total_tokens: number };
  return {
    todayRuns: today.runs,
    todayPromptTokens: today.prompt_tokens,
    todayCompletionTokens: today.completion_tokens,
    todayTokens: today.total_tokens,
    totalRuns: all.runs,
    totalTokens: all.total_tokens,
  };
}

// 资金/状态写入的事务包装：同一进程内可嵌套（内层直接复用外层事务）。
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
  if (transactionDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  transactionDepth += 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 事务已经结束
    }
    throw error;
  } finally {
    transactionDepth -= 1;
  }
}

export default db;
