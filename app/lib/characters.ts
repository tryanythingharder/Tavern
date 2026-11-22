import db, { type DbCharacter } from '@/lib/db';
import { CATEGORIES } from '@/lib/catalog';
import { saveMedia } from '@/lib/storage';
import { localizeSeedRow, seedIdsMatching } from './seed-i18n';

export { CATEGORIES } from '@/lib/catalog';

// ST V2 角色卡高级字段：作者在编辑器「高级」里填写，导入/导出时一一对应
export type CardFields = {
  personality: string;
  scenario: string;
  mesExample: string;
  systemPrompt: string;
  postHistory: string;
  creatorNotes: string;
};
export const CARD_FIELD_LIMITS: Record<keyof CardFields, number> = {
  // 社区卡动辄上万字：上限按「导入不丢内容」设，真正喂给模型的长度由提示词预算控制
  personality: 20000, scenario: 20000, mesExample: 30000, systemPrompt: 20000, postHistory: 20000, creatorNotes: 30000,
};
export function emptyCardFields(): CardFields {
  return { personality: '', scenario: '', mesExample: '', systemPrompt: '', postHistory: '', creatorNotes: '' };
}
export function parseCardFields(raw: string | null | undefined): CardFields {
  const out = emptyCardFields();
  if (!raw) return out;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(out) as (keyof CardFields)[]) {
      if (typeof data[key] === 'string') out[key] = (data[key] as string).slice(0, CARD_FIELD_LIMITS[key]);
    }
  } catch {
    // 坏数据按空处理
  }
  return out;
}
export function normalizeCardFields(value: unknown): CardFields {
  const out = emptyCardFields();
  if (!value || typeof value !== 'object') return out;
  const data = value as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof CardFields)[]) {
    out[key] = String(data[key] ?? '').trim().slice(0, CARD_FIELD_LIMITS[key]);
  }
  return out;
}

export function parseOpenings(raw: string | null): { title: string; text: string }[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((item, index) => ({
        title: String((item && item.title) || `备用开场 ${index + 1}`).slice(0, 60),
        text: String((item && item.text) || '').trim(),
      }))
      .filter((item) => item.text)
      .slice(0, 40);
  } catch {
    return [];
  }
}

// M5 角色：种子角色来自 data/characters.ts，用户自创的角色存进同一张表（owner_id 非空）。
export type CharacterView = {
  id: string;
  name: string;
  author: string;
  initial: string;
  hue: number;
  category: string;
  tags: string[];
  nsfw: boolean;
  chats: string;
  greeting: string;
  hook: string;
  description: string;
  pace: string;
  ownerId: number | null;
  status: string;
  createdAt: number;
  alternateGreetings: { title: string; text: string }[];
  coverImage: string | null;
  avatarImage: string | null;
  reviewNote: string | null;
  card: CardFields;
};

export function characterView(source: DbCharacter): CharacterView {
  const row = localizeSeedRow(source);
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.map(String).slice(0, 12);
  } catch {
    // 旧数据里 tags 不是 JSON 时忽略
  }
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    initial: row.initial,
    hue: row.hue,
    category: row.category,
    tags,
    nsfw: row.nsfw === 1,
    chats: row.chats,
    greeting: row.greeting,
    hook: row.hook,
    description: row.description,
    pace: row.pace,
    ownerId: row.owner_id ?? null,
    status: row.status,
    createdAt: row.created_at ?? 0,
    alternateGreetings: parseOpenings(row.alternate_greetings),
    coverImage: row.cover_image ?? null,
    avatarImage: row.avatar_image ?? null,
    reviewNote: row.review_note ?? null,
    card: parseCardFields(row.card_fields),
  };
}

export function listCharacterViews(category?: string, options: { hideNsfw?: boolean } = {}): CharacterView[] {
  const rows = db.prepare("SELECT * FROM characters WHERE status = 'published' ORDER BY rowid").all() as DbCharacter[];
  let list = rows.map(characterView);
  if (options.hideNsfw) list = list.filter((item) => !item.nsfw);
  return category && category !== '全部' ? list.filter((item) => item.category === category) : list;
}

export function getCharacterView(id: string): CharacterView | undefined {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as DbCharacter | undefined;
  return row ? characterView(row) : undefined;
}

export function listOwnedCharacters(ownerId: number): CharacterView[] {
  const rows = db.prepare('SELECT * FROM characters WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as DbCharacter[];
  return rows.map(characterView);
}

function heat(value: string): number {
  const number = Number(String(value).replace(/[^\d.]/g, '')) || 0;
  return String(value).includes('万') ? number * 10000 : number;
}

export function searchCharacterViews(
  query: string,
  options: { hideNsfw?: boolean; category?: string; sort?: 'relevance' | 'hot' | 'new' } = {},
): CharacterView[] {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const rows = db.prepare(`
        SELECT * FROM characters
        WHERE status = 'published' AND (name LIKE ? ESCAPE '\\' OR hook LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')
        ORDER BY rowid LIMIT 60
    `).all(like, like, like, like, like) as DbCharacter[];
  // 英文界面：种子角色按英文卡面也能搜到
  const extra = seedIdsMatching(q).filter((id) => !rows.some((row) => row.id === id));
  if (extra.length) rows.push(...(db.prepare(`SELECT * FROM characters WHERE status = 'published' AND id IN (${extra.map(() => '?').join(',')})`).all(...extra) as DbCharacter[]));
  let list = rows.map(characterView);
  if (options.hideNsfw) list = list.filter((item) => !item.nsfw);
  if (options.category && options.category !== '全部') list = list.filter((item) => item.category === options.category);
  if (options.sort === 'hot') list = [...list].sort((a, b) => heat(b.chats) - heat(a.chats));
  else if (options.sort === 'new') list = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return list;
}

export type CharacterInput = {
  name?: string;
  hook?: string;
  greeting?: string;
  description?: string;
  pace?: string;
  tags?: unknown;
  category?: string;
  nsfw?: boolean;
  status?: 'draft' | 'published';
  alternateGreetings?: unknown;
  coverData?: unknown;
  avatarData?: unknown;
  card?: unknown;
};

function normalizeInput(input: CharacterInput, fallbackName = '新角色') {
  const name = String(input.name ?? '').trim().slice(0, 32) || fallbackName;
  const tags = Array.isArray(input.tags)
    ? input.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12)
    : String(input.tags ?? '').split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  return {
    name,
    hook: String(input.hook ?? '').trim().slice(0, 90),
    greeting: String(input.greeting ?? '').trim().slice(0, 30000),
    description: String(input.description ?? '').trim().slice(0, 60000),
    pace: String(input.pace ?? '').trim().slice(0, 120) || '慢热 · 细节叙事',
    tags,
    category: (CATEGORIES as readonly string[]).includes(String(input.category)) ? String(input.category) : '现代',
    nsfw: input.nsfw === true,
    alternateGreetings: normalizeOpenings(input.alternateGreetings),
  };
}

// 备用开场：接受数组，或「---」分隔的文本（每段第一行作为标题）
function normalizeOpenings(value: unknown): { title: string; text: string }[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (typeof item === 'string') return { title: `备用开场 ${index + 1}`, text: item.trim() };
        const record = item as { title?: unknown; text?: unknown };
        return { title: String(record?.title ?? `备用开场 ${index + 1}`).slice(0, 40), text: String(record?.text ?? '').trim() };
      })
      .filter((item) => item.text)
      .slice(0, 40);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n\s*---\s*\n/)
      .map((block, index) => {
        const lines = block.trim().split('\n');
        const first = lines[0]?.trim() ?? '';
        const hasTitle = lines.length > 1 && first.length <= 20 && !/[。！？.!?]/.test(first);
        return hasTitle ? { title: first, text: lines.slice(1).join('\n').trim() } : { title: `备用开场 ${index + 1}`, text: block.trim() };
      })
      .filter((item) => item.text)
      .slice(0, 40);
  }
  return [];
}

export function createCharacter(ownerId: number, author: string, input: CharacterInput): CharacterView | null {
  const values = normalizeInput(input);
  if (input.status !== 'draft' && (!values.hook || !values.greeting)) return null;
  const id = `u${ownerId}-${Math.random().toString(36).slice(2, 8)}`;
  const hue = Math.abs([...values.name].reduce((sum, char) => sum + char.codePointAt(0)!, 0)) % 360;
  const now = Date.now();
  db.prepare(`
        INSERT INTO characters (id, name, author, initial, hue, category, tags, nsfw, chats, greeting, hook, description, pace, owner_id, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
    id,
    values.name,
    author.slice(0, 24) || '旅人',
    Array.from(values.name)[0] ?? '新',
    hue,
    values.category,
    JSON.stringify(values.tags),
    values.nsfw ? 1 : 0,
    '0',
    values.greeting,
    values.hook,
    values.description,
    values.pace,
    ownerId,
    input.status === 'draft' ? 'draft' : 'pending',
    now,
  );
  if (values.alternateGreetings.length) {
    db.prepare('UPDATE characters SET alternate_greetings = ? WHERE id = ?').run(JSON.stringify(values.alternateGreetings), id);
  }
  if (input.card !== undefined) db.prepare('UPDATE characters SET card_fields = ? WHERE id = ?').run(JSON.stringify(normalizeCardFields(input.card)), id);
  applyCover(input.coverData, id, ownerId);
  applyAvatar(input.avatarData, id, ownerId);
  return getCharacterView(id) ?? null;
}

export function updateCharacter(ownerId: number, id: string, input: CharacterInput): CharacterView | null {
  const row = db.prepare('SELECT * FROM characters WHERE id = ? AND owner_id = ?').get(id, ownerId) as DbCharacter | undefined;
  if (!row) return null;
  const values = normalizeInput(input, row.name);
  if (input.status !== 'draft' && (!values.hook || !values.greeting)) return null;
  const nextStatus = input.status === 'draft'
    ? 'draft'
    : input.status === 'published'
      ? (row.status === 'published' ? 'published' : 'pending')
      : row.status;

  // 内容有变化才留版本，最多 VERSION_KEEP 版
  const nextCard = input.card !== undefined ? JSON.stringify(normalizeCardFields(input.card)) : (row.card_fields ?? null);
  const before = JSON.stringify([row.name, row.hook, row.greeting, row.description, row.pace, row.tags, row.category, row.nsfw, row.card_fields ?? null]);
  const after = JSON.stringify([values.name, values.hook, values.greeting, values.description, values.pace, JSON.stringify(values.tags), values.category, values.nsfw ? 1 : 0, nextCard]);
  if (before !== after) snapshotVersion(id);

  db.prepare(`
        UPDATE characters SET name = ?, initial = ?, category = ?, tags = ?, nsfw = ?, greeting = ?, hook = ?, description = ?, pace = ?, status = ?, alternate_greetings = ?
        WHERE id = ? AND owner_id = ?
    `).run(
    values.name,
    Array.from(values.name)[0] ?? '新',
    values.category,
    JSON.stringify(values.tags),
    values.nsfw ? 1 : 0,
    values.greeting,
    values.hook,
    values.description,
    values.pace,
    nextStatus,
    JSON.stringify(values.alternateGreetings),
    id,
    ownerId,
  );
  if (input.card !== undefined) db.prepare('UPDATE characters SET card_fields = ? WHERE id = ?').run(nextCard, id);
  applyCover(input.coverData, id, ownerId);
  applyAvatar(input.avatarData, id, ownerId);
  return getCharacterView(id) ?? null;
}

// 封面：接受 data:image/...;base64 字符串，存到 .data/media
function applyCover(data: unknown, characterId: string, ownerId: number): void {
  const url = mediaFromDataUrl(data, ownerId);
  if (url) setCharacterCover(characterId, url);
}

// 形象：对话头像/角色小头像，和封面分开存
function applyAvatar(data: unknown, characterId: string, ownerId: number): void {
  const url = mediaFromDataUrl(data, ownerId);
  if (url) setCharacterAvatar(characterId, url);
}

function mediaFromDataUrl(data: unknown, ownerId: number): string | null {
  if (typeof data !== 'string' || !data.startsWith('data:image/')) return null;
  const match = data.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
  const extension = match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : match[1];
  return saveMedia(buffer, extension, { ownerId, visibility: 'public' });
}

// ---------- 作品版本 ----------

export type CharacterVersion = { id: number; revision: number; createdAt: number; snapshot: Record<string, unknown> };

export const VERSION_KEEP = 20;

function snapshotVersion(characterId: string): void {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId) as DbCharacter | undefined;
  if (!row) return;
  // 用最大版本号 +1（按条数算的话，旧版被清掉后会出现重复的版本号）
  const count = (db.prepare('SELECT COALESCE(MAX(revision), 0) AS count FROM character_versions WHERE character_id = ?').get(characterId) as { count: number }).count;
  const snapshot = {
    name: row.name,
    hook: row.hook,
    greeting: row.greeting,
    description: row.description,
    pace: row.pace,
    alternateGreetings: characterView(row).alternateGreetings,
    tags: characterView(row).tags,
    category: row.category,
    nsfw: row.nsfw === 1,
    status: row.status,
    // ST 高级字段（性格、场景、对话示例、系统提示等）也要留，否则恢复旧版会把它们丢掉
    card: parseCardFields(row.card_fields),
  };
  db.prepare('INSERT INTO character_versions (character_id, revision, snapshot, created_at) VALUES (?,?,?,?)').run(characterId, count + 1, JSON.stringify(snapshot), Date.now());
  db.prepare(`
        DELETE FROM character_versions WHERE character_id = ? AND id NOT IN (
            SELECT id FROM character_versions WHERE character_id = ? ORDER BY id DESC LIMIT ?
        )
    `).run(characterId, characterId, VERSION_KEEP);
}

export function listVersions(characterId: string, ownerId: number): CharacterVersion[] {
  const owned = db.prepare('SELECT 1 AS ok FROM characters WHERE id = ? AND owner_id = ?').get(characterId, ownerId);
  if (!owned) return [];
  const rows = db.prepare('SELECT * FROM character_versions WHERE character_id = ? ORDER BY id DESC').all(characterId) as { id: number; revision: number; snapshot: string; created_at: number }[];
  return rows.map((row) => ({ id: row.id, revision: row.revision, createdAt: row.created_at, snapshot: JSON.parse(row.snapshot) as Record<string, unknown> }));
}

export function restoreVersion(ownerId: number, characterId: string, versionId: number): CharacterView | null {
  const owned = db.prepare('SELECT 1 AS ok FROM characters WHERE id = ? AND owner_id = ?').get(characterId, ownerId);
  if (!owned) return null;
  const row = db.prepare('SELECT snapshot FROM character_versions WHERE id = ? AND character_id = ?').get(versionId, characterId) as { snapshot: string } | undefined;
  if (!row) return null;
  const snapshot = JSON.parse(row.snapshot) as CharacterInput & { status?: 'draft' | 'published' };
  return updateCharacter(ownerId, characterId, { ...snapshot, status: snapshot.status });
}

// 还有会话在用时改成下架（从广场/搜索消失，但已有对话仍然能读），没有会话才真删。
export function setCharacterCover(characterId: string, url: string): void {
  db.prepare('UPDATE characters SET cover_image = ? WHERE id = ?').run(url, characterId);
}

export function setCharacterAvatar(characterId: string, url: string): void {
  db.prepare('UPDATE characters SET avatar_image = ? WHERE id = ?').run(url, characterId);
}

export function deleteCharacter(ownerId: number, id: string): 'deleted' | 'archived' | false {
  const row = db.prepare('SELECT id FROM characters WHERE id = ? AND owner_id = ?').get(id, ownerId);
  if (!row) return false;
  const chats = (db.prepare('SELECT COUNT(*) AS count FROM chats WHERE character_id = ?').get(id) as { count: number }).count;
  if (chats > 0) {
    db.prepare("UPDATE characters SET status = 'archived' WHERE id = ? AND owner_id = ?").run(id, ownerId);
    return 'archived';
  }
  return Number(db.prepare('DELETE FROM characters WHERE id = ? AND owner_id = ?').run(id, ownerId).changes) > 0 ? 'deleted' : false;
}

// ---------- 评论 ----------

export type Comment = { id: number; characterId: string; userId: number; nickname: string; content: string; createdAt: number };

export function listComments(characterId: string, limit = 50): Comment[] {
  const rows = db.prepare(`
        SELECT c.id, c.character_id, c.user_id, c.content, c.created_at, u.nickname
        FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.character_id = ? AND c.status = 'visible'
        ORDER BY c.id DESC LIMIT ?
    `).all(characterId, limit) as { id: number; character_id: string; user_id: number; content: string; created_at: number; nickname: string }[];
  return rows.map((row) => ({ id: row.id, characterId: row.character_id, userId: row.user_id, nickname: row.nickname, content: row.content, createdAt: row.created_at }));
}

export function addComment(characterId: string, userId: number, content: string): Comment | null {
  const text = String(content ?? '').trim().slice(0, 500);
  if (!text) return null;
  const now = Date.now();
  const result = db.prepare('INSERT INTO comments (character_id, user_id, content, created_at) VALUES (?,?,?,?)').run(characterId, userId, text, now);
  const nickname = (db.prepare('SELECT nickname FROM users WHERE id = ?').get(userId) as { nickname: string } | undefined)?.nickname ?? '旅人';
  return { id: Number(result.lastInsertRowid), characterId, userId, nickname, content: text, createdAt: now };
}

export function deleteComment(commentId: number, userId: number, isAdmin: boolean): boolean {
  const row = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(commentId) as { user_id: number } | undefined;
  if (!row) return false;
  if (!isAdmin && row.user_id !== userId) return false;
  return Number(db.prepare('DELETE FROM comments WHERE id = ?').run(commentId).changes) > 0;
}


// ---------- 收藏（角色库） ----------

export function isFavorite(userId: number, characterId: string): boolean {
  return Boolean(db.prepare('SELECT 1 AS ok FROM character_favorites WHERE user_id = ? AND character_id = ?').get(userId, characterId));
}

export function toggleFavorite(userId: number, characterId: string, value: boolean): boolean {
  if (value) {
    db.prepare('INSERT OR IGNORE INTO character_favorites (user_id, character_id, created_at) VALUES (?,?,?)').run(userId, characterId, Date.now());
  } else {
    db.prepare('DELETE FROM character_favorites WHERE user_id = ? AND character_id = ?').run(userId, characterId);
  }
  return value;
}

export function listFavoriteCharacters(userId: number): CharacterView[] {
  const rows = db.prepare(`
        SELECT c.* FROM character_favorites f JOIN characters c ON c.id = f.character_id
        WHERE f.user_id = ? AND c.status = 'published' ORDER BY f.created_at DESC
    `).all(userId) as DbCharacter[];
  return rows.map(characterView);
}

// ---------- 角色库「已添加」 ----------

export function isAdded(userId: number, characterId: string): boolean {
  return Boolean(db.prepare('SELECT 1 AS ok FROM character_added WHERE user_id = ? AND character_id = ?').get(userId, characterId));
}

export function toggleAdded(userId: number, characterId: string, value: boolean): boolean {
  if (value) {
    db.prepare('INSERT OR IGNORE INTO character_added (user_id, character_id, created_at) VALUES (?,?,?)').run(userId, characterId, Date.now());
  } else {
    db.prepare('DELETE FROM character_added WHERE user_id = ? AND character_id = ?').run(userId, characterId);
  }
  return value;
}

export function listAddedCharacters(userId: number): CharacterView[] {
  const rows = db.prepare(`
        SELECT c.* FROM character_added a JOIN characters c ON c.id = a.character_id
        WHERE a.user_id = ? AND c.status = 'published' ORDER BY a.created_at DESC
    `).all(userId) as DbCharacter[];
  return rows.map(characterView);
}

export function countChatsForCharacter(userId: number, characterId: string): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM chats WHERE user_id = ? AND character_id = ?').get(userId, characterId) as { count: number }).count;
}

export function latestChatForCharacter(userId: number, characterId: string): number | null {
  const row = db.prepare('SELECT id FROM chats WHERE user_id = ? AND character_id = ? ORDER BY updated_at DESC LIMIT 1').get(userId, characterId) as { id: number } | undefined;
  return row ? row.id : null;
}
