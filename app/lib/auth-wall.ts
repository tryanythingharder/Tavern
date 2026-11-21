import { existsSync } from 'node:fs';
import path from 'node:path';
import db from '@/lib/db';

// 登录 / 注册页右侧立绘墙：取角色库里公开、非 18+、有图的热门角色（按对话数），每小时刷新一次。
// 图少时循环错位铺满；库里一张都没有时才用内置的全年龄立绘兜底。

const BUILTIN = ['lin-wanzhao', 'a-heng', 'lu-shiyan', 'bai-lu']; // 全年龄的内置立绘
const TTL = 60 * 60 * 1000;
const WANT = 15; // 5 列 × 3 张
let cache: { at: number; images: string[] } | null = null;

function builtinSrc(id: string): string | null {
  return existsSync(path.join(process.cwd(), 'public', 'characters', `${id}.jpg`)) ? `/characters/${id}.jpg` : null;
}

function load(): string[] {
  const rows = db.prepare(`
    SELECT c.id, c.owner_id, c.cover_image, c.avatar_image, COUNT(ch.id) AS n
    FROM characters c LEFT JOIN chats ch ON ch.character_id = c.id
    WHERE c.status = 'published' AND c.nsfw = 0
    GROUP BY c.id ORDER BY n DESC, c.rowid
  `).all() as { id: string; owner_id: number | null; cover_image: string | null; avatar_image: string | null; n: number }[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const src = (row.cover_image && row.cover_image.startsWith('/') ? row.cover_image : null)
      || (row.avatar_image && row.avatar_image.startsWith('/') ? row.avatar_image : null)
      || (row.owner_id === null ? builtinSrc(row.id) : null);
    if (src && !seen.has(src)) { seen.add(src); out.push(src); }
    if (out.length >= WANT) break;
  }
  return out;
}

/** 返回 5 列，每列 3 张（图少时循环错位铺满）。 */
export function authWallColumns(): string[][] {
  if (!cache || Date.now() - cache.at > TTL) {
    try { cache = { at: Date.now(), images: load() }; } catch { cache = { at: Date.now(), images: BUILTIN.map((id) => `/characters/${id}.jpg`) }; }
  }
  const imgs = cache.images.length ? cache.images : BUILTIN.map((id) => `/characters/${id}.jpg`);
  return Array.from({ length: 5 }, (_, col) => Array.from({ length: 3 }, (_, k) => imgs[(col * 3 + k + (imgs.length < WANT ? col : 0)) % imgs.length]));
}
