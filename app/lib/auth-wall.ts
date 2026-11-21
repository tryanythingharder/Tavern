import { existsSync } from 'node:fs';
import path from 'node:path';
import db from '@/lib/db';

// 登录 / 注册页右侧「名册」：取角色库里公开、非 18+、有图的热门角色（按对话数），每小时刷新一次。
// 库里一张都没有时才用内置的全年龄立绘兜底。

const BUILTIN = ['lin-wanzhao', 'a-heng', 'lu-shiyan', 'bai-lu']; // 全年龄的内置立绘
const TTL = 60 * 60 * 1000;

function builtinSrc(id: string): string | null {
  return existsSync(path.join(process.cwd(), 'public', 'characters', `${id}.jpg`)) ? `/characters/${id}.jpg` : null;
}

export type RosterEntry = { id: string; name: string; category: string; author: string; src: string };
let rosterCache: { at: number; list: RosterEntry[] } | null = null;
const ROSTER_MAX = 12;
const BUILTIN_NAMES: Record<string, [string, string, string]> = {
  'lin-wanzhao': ['林晚照', '现代', '青梧'], 'a-heng': ['阿蘅', '治愈', '鹿鸣'], 'lu-shiyan': ['陆时衍', '现代', '南枝'], 'bai-lu': ['白露', '奇幻', '照野'],
};

function loadRoster(): RosterEntry[] {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.category, c.author, c.owner_id, c.cover_image, c.avatar_image, COUNT(ch.id) AS n
    FROM characters c LEFT JOIN chats ch ON ch.character_id = c.id
    WHERE c.status = 'published' AND c.nsfw = 0
    GROUP BY c.id ORDER BY n DESC, c.rowid
  `).all() as { id: string; name: string; category: string; author: string; owner_id: number | null; cover_image: string | null; avatar_image: string | null }[];
  const out: RosterEntry[] = [];
  for (const row of rows) {
    const src = (row.cover_image && row.cover_image.startsWith('/') ? row.cover_image : null)
      || (row.avatar_image && row.avatar_image.startsWith('/') ? row.avatar_image : null)
      || (row.owner_id === null ? builtinSrc(row.id) : null);
    if (!src) continue;
    out.push({ id: row.id, name: row.name.slice(0, 16), category: (row.category || '').slice(0, 6), author: (row.author || '').slice(0, 12), src });
    if (out.length >= ROSTER_MAX) break;
  }
  return out;
}

/** 登录页「名册」：公开、全年龄、有图的热门角色，最多 12 位；库里没有时用内置角色兜底。 */
export function authRoster(): RosterEntry[] {
  if (!rosterCache || Date.now() - rosterCache.at > TTL) {
    let list: RosterEntry[] = [];
    try { list = loadRoster(); } catch { list = []; }
    rosterCache = { at: Date.now(), list };
  }
  if (rosterCache.list.length) return rosterCache.list;
  return BUILTIN.map((id) => ({ id, name: BUILTIN_NAMES[id][0], category: BUILTIN_NAMES[id][1], author: BUILTIN_NAMES[id][2], src: `/characters/${id}.jpg` }));
}
