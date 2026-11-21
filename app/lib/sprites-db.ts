import db from '@/lib/db';
import { EXPRESSION_LABELS, type ExpressionLabel, type SpriteMap } from '@/lib/expressions';

// 表情立绘：作者上传的对所有玩家可见；玩家自己上传的只自己看得到（同标签时玩家的优先）
db.exec(`CREATE TABLE IF NOT EXISTS character_sprites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  src TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sprites_char ON character_sprites(character_id, owner_id);`);

export type SpriteRow = { id: number; label: ExpressionLabel; src: string; mine: boolean; byAuthor: boolean };

export function listSprites(characterId: string, viewerId: number, authorId: number | null): SpriteRow[] {
  const rows = db.prepare('SELECT id, owner_id, label, src FROM character_sprites WHERE character_id = ? AND owner_id IN (?, ?) ORDER BY id')
    .all(characterId, viewerId, authorId ?? -1) as { id: number; owner_id: number; label: ExpressionLabel; src: string }[];
  return rows.map((row) => ({ id: row.id, label: row.label, src: row.src, mine: row.owner_id === viewerId, byAuthor: row.owner_id === authorId }));
}

/** 给对话页用：标签 → 图片地址。玩家自己有这个标签就只用自己的 */
export function spriteMap(characterId: string, viewerId: number, authorId: number | null): SpriteMap {
  const rows = listSprites(characterId, viewerId, authorId);
  const map: SpriteMap = {};
  for (const label of EXPRESSION_LABELS) {
    const own = rows.filter((row) => row.label === label && row.mine);
    const list = (own.length ? own : rows.filter((row) => row.label === label)).map((row) => row.src);
    if (list.length) map[label] = list;
  }
  return map;
}

export function addSprite(characterId: string, ownerId: number, label: ExpressionLabel, src: string): void {
  db.prepare('INSERT INTO character_sprites (character_id, owner_id, label, src, created_at) VALUES (?,?,?,?,?)').run(characterId, ownerId, label, src, Date.now());
}

export function countOwn(characterId: string, ownerId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM character_sprites WHERE character_id = ? AND owner_id = ?').get(characterId, ownerId) as { n: number }).n;
}

export function deleteSprites(characterId: string, ownerId: number, ids: number[] | 'all'): number {
  if (ids === 'all') return Number(db.prepare('DELETE FROM character_sprites WHERE character_id = ? AND owner_id = ?').run(characterId, ownerId).changes);
  const stmt = db.prepare('DELETE FROM character_sprites WHERE id = ? AND character_id = ? AND owner_id = ?');
  return ids.reduce((n, id) => n + Number(stmt.run(id, characterId, ownerId).changes), 0);
}

export function relabelSprite(characterId: string, ownerId: number, id: number, label: ExpressionLabel): boolean {
  return db.prepare('UPDATE character_sprites SET label = ? WHERE id = ? AND character_id = ? AND owner_id = ?').run(label, id, characterId, ownerId).changes > 0;
}
