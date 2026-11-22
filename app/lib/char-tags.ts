import db from '@/lib/db';

// 角色库标签（对齐 ST 的 Tags / Tag Folders）：每个玩家自己的标签，和卡片作者写的 tags 分开。
// folder: none = 普通标签；open = 文件夹，里面的角色仍出现在主列表（ST「Open Folder」）；
//         closed = 文件夹，里面的角色只在进入文件夹后显示（ST「Closed Folder」）。
db.exec(`
  CREATE TABLE IF NOT EXISTS user_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    folder TEXT NOT NULL DEFAULT 'none',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_tags_name ON user_tags(user_id, name);
  CREATE TABLE IF NOT EXISTS user_tag_links (
    user_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    character_id TEXT NOT NULL,
    PRIMARY KEY (tag_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_tag_links_user ON user_tag_links(user_id, character_id);
`);

// node:sqlite 没有 db.transaction；已在事务里就直接跑（importCardTags 里会嵌套调用 assignTags）
function tx(fn: () => void): void {
  if (db.isTransaction) return fn();
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export type TagFolder = 'none' | 'open' | 'closed';
export type UserTag = { id: number; name: string; color: string; folder: TagFolder; sort: number };

const FOLDERS: TagFolder[] = ['none', 'open', 'closed'];
const MAX_TAGS = 200;

function cleanName(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
}
function cleanColor(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : '';
}
function cleanFolder(value: unknown): TagFolder {
  return FOLDERS.includes(value as TagFolder) ? (value as TagFolder) : 'none';
}

type Row = { id: number; name: string; color: string; folder: string; sort: number };
const view = (row: Row): UserTag => ({ id: row.id, name: row.name, color: row.color, folder: cleanFolder(row.folder), sort: row.sort });

export function listTags(userId: number): UserTag[] {
  return (db.prepare('SELECT id, name, color, folder, sort FROM user_tags WHERE user_id = ? ORDER BY sort, id').all(userId) as Row[]).map(view);
}

/** 角色 id → 标签 id 列表 */
export function tagMap(userId: number): Record<string, number[]> {
  const rows = db.prepare('SELECT tag_id, character_id FROM user_tag_links WHERE user_id = ? ORDER BY tag_id').all(userId) as { tag_id: number; character_id: string }[];
  const map: Record<string, number[]> = {};
  for (const row of rows) (map[row.character_id] ??= []).push(row.tag_id);
  return map;
}

function ownTag(userId: number, tagId: number): boolean {
  return Boolean(db.prepare('SELECT 1 AS ok FROM user_tags WHERE id = ? AND user_id = ?').get(tagId, userId));
}

export function createTag(userId: number, input: { name?: unknown; color?: unknown; folder?: unknown }): UserTag | { error: string } {
  const name = cleanName(input.name);
  if (!name) return { error: '标签名不能为空' };
  const existing = db.prepare('SELECT id, name, color, folder, sort FROM user_tags WHERE user_id = ? AND name = ?').get(userId, name) as Row | undefined;
  if (existing) return view(existing);
  const count = (db.prepare('SELECT COUNT(*) AS n FROM user_tags WHERE user_id = ?').get(userId) as { n: number }).n;
  if (count >= MAX_TAGS) return { error: `标签最多 ${MAX_TAGS} 个` };
  const sort = ((db.prepare('SELECT MAX(sort) AS m FROM user_tags WHERE user_id = ?').get(userId) as { m: number | null }).m ?? 0) + 1;
  const result = db
    .prepare('INSERT INTO user_tags (user_id, name, color, folder, sort, created_at) VALUES (?,?,?,?,?,?)')
    .run(userId, name, cleanColor(input.color), cleanFolder(input.folder), sort, Date.now());
  return { id: Number(result.lastInsertRowid), name, color: cleanColor(input.color), folder: cleanFolder(input.folder), sort };
}

export function updateTag(userId: number, tagId: number, input: { name?: unknown; color?: unknown; folder?: unknown; sort?: unknown }): UserTag | { error: string } | null {
  const row = db.prepare('SELECT id, name, color, folder, sort FROM user_tags WHERE id = ? AND user_id = ?').get(tagId, userId) as Row | undefined;
  if (!row) return null;
  const next = { ...row };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) return { error: '标签名不能为空' };
    const clash = db.prepare('SELECT id FROM user_tags WHERE user_id = ? AND name = ? AND id != ?').get(userId, name, tagId);
    if (clash) return { error: '已有同名标签' };
    next.name = name;
  }
  if (input.color !== undefined) next.color = cleanColor(input.color);
  if (input.folder !== undefined) next.folder = cleanFolder(input.folder);
  if (input.sort !== undefined && Number.isFinite(Number(input.sort))) next.sort = Math.trunc(Number(input.sort));
  db.prepare('UPDATE user_tags SET name = ?, color = ?, folder = ?, sort = ? WHERE id = ?').run(next.name, next.color, next.folder, next.sort, tagId);
  return view(next);
}

/** 按给定顺序重排（ST 标签管理里拖动排序） */
export function reorderTags(userId: number, ids: number[]): void {
  const update = db.prepare('UPDATE user_tags SET sort = ? WHERE id = ? AND user_id = ?');
  tx(() => ids.forEach((id, index) => update.run(index + 1, id, userId)));
}

export function deleteTag(userId: number, tagId: number): boolean {
  if (!ownTag(userId, tagId)) return false;
  tx(() => {
    db.prepare('DELETE FROM user_tag_links WHERE tag_id = ? AND user_id = ?').run(tagId, userId);
    db.prepare('DELETE FROM user_tags WHERE id = ? AND user_id = ?').run(tagId, userId);
  });
  return true;
}

/** 批量加/去标签：characterIds × add / remove */
export function assignTags(userId: number, characterIds: string[], add: number[], remove: number[]): void {
  const ids = [...new Set(characterIds.map(String).filter(Boolean))].slice(0, 500);
  const addOk = add.filter((id) => ownTag(userId, id));
  const removeOk = remove.filter((id) => ownTag(userId, id));
  const ins = db.prepare('INSERT OR IGNORE INTO user_tag_links (user_id, tag_id, character_id) VALUES (?,?,?)');
  const del = db.prepare('DELETE FROM user_tag_links WHERE user_id = ? AND tag_id = ? AND character_id = ?');
  tx(() => {
    for (const characterId of ids) {
      for (const tagId of addOk) ins.run(userId, tagId, characterId);
      for (const tagId of removeOk) del.run(userId, tagId, characterId);
    }
  });
}

/**
 * 把卡片自带的 tags 变成玩家自己的标签（ST 导入角色时的「Import tags」）。
 * 返回新建了几个标签、给几张卡打了标签。
 */
export function importCardTags(userId: number, cards: { id: string; tags: string[] }[]): { created: number; linked: number } {
  let created = 0;
  let linked = 0;
  const before = new Set(listTags(userId).map((tag) => tag.name));
  tx(() => {
    for (const card of cards) {
      const tagIds: number[] = [];
      for (const raw of card.tags) {
        const name = cleanName(raw);
        if (!name) continue;
        const tag = createTag(userId, { name });
        if ('error' in tag) continue;
        if (!before.has(name)) {
          before.add(name);
          created += 1;
        }
        tagIds.push(tag.id);
      }
      if (tagIds.length) {
        assignTags(userId, [card.id], tagIds, []);
        linked += 1;
      }
    }
  });
  return { created, linked };
}

/**
 * 导入 ST 的标签备份（settings.json 里的 tags + tag_map，或单独导出的同结构 JSON）。
 * ST 的 tag_map 键是头像文件名（xxx.png），这里按角色名（去扩展名）去匹配玩家库里的角色。
 */
export function importStTags(
  userId: number,
  data: { tags?: unknown; tag_map?: unknown },
  characters: { id: string; name: string }[],
): { created: number; linked: number } {
  const tags = Array.isArray(data.tags) ? (data.tags as Record<string, unknown>[]) : [];
  const idMap = new Map<string, number>();
  let created = 0;
  const before = new Set(listTags(userId).map((tag) => tag.name));
  tx(() => {
    for (const item of tags) {
      const name = cleanName(item.name);
      if (!name) continue;
      const folderType = String(item.folder_type ?? 'NONE').toUpperCase();
      const folder: TagFolder = folderType === 'OPEN' ? 'open' : folderType === 'CLOSED' ? 'closed' : 'none';
      const tag = createTag(userId, { name, color: item.color, folder });
      if ('error' in tag) continue;
      if (!before.has(name)) {
        before.add(name);
        created += 1;
      } else {
        updateTag(userId, tag.id, { folder, ...(cleanColor(item.color) ? { color: item.color } : {}) });
      }
      idMap.set(String(item.id ?? name), tag.id);
    }
  });
  let linked = 0;
  const byName = new Map(characters.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const map = data.tag_map && typeof data.tag_map === 'object' ? (data.tag_map as Record<string, unknown>) : {};
  for (const [avatar, list] of Object.entries(map)) {
    if (!Array.isArray(list)) continue;
    // ST 重名卡会存成「名字1.png」「名字2.png」，精确匹配不到再去掉末尾数字
    const base = avatar.replace(/\.(png|webp|json|charx)$/i, '').trim().toLowerCase();
    const characterId = byName.get(base) ?? byName.get(base.replace(/\d+$/, '').trim());
    if (!characterId) continue;
    const ids = list.map((id) => idMap.get(String(id))).filter((id): id is number => typeof id === 'number');
    if (!ids.length) continue;
    assignTags(userId, [characterId], ids, []);
    linked += 1;
  }
  return { created, linked };
}

/** 导出成 ST 能读的结构（tags + tag_map，键是角色名.png） */
export function exportStTags(userId: number, characters: { id: string; name: string }[]): { tags: unknown[]; tag_map: Record<string, string[]> } {
  const tags = listTags(userId);
  const map = tagMap(userId);
  const nameOf = new Map(characters.map((c) => [c.id, c.name]));
  const tag_map: Record<string, string[]> = {};
  for (const [characterId, ids] of Object.entries(map)) {
    const name = nameOf.get(characterId);
    if (name) tag_map[`${name}.png`] = ids.map(String);
  }
  return {
    tags: tags.map((tag) => ({
      id: String(tag.id),
      name: tag.name,
      color: tag.color,
      color2: '',
      folder_type: tag.folder.toUpperCase(),
      sort_order: tag.sort,
      create_date: Date.now(),
    })),
    tag_map,
  };
}
