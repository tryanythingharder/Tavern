import db, { type DbCharacter } from '@/lib/db';
import { characterView } from '@/lib/characters';

// 种子创作者简介：原型作者页有公开简介，数据库里没有作者表，先用固定文案。
// 用户自创角色的作者（账号昵称）没有简介时显示空态。
const AUTHOR_BIOS: Record<string, string> = {
  青梧: '写雨、旧城和没有说完的话。喜欢把关系放进具体的生活细节里，让角色先成为一个真实的人。',
  照野: '偏爱荒野、旧公路和沉默的人。写风把话吹散之前，两个人还愿意坐下来喝完一杯。',
  南枝: '在南方小城长大，写潮湿的夏天、迟到的信和没关好的窗。故事大多慢热，但会记得你说过的话。',
  鹿鸣: '擅长热闹的群像与轻喜剧，相信每个人都值得被认真听见。喜欢让角色先开玩笑，再认真。',
  不系舟: '写远行、码头与夜里还亮着灯的屋子。角色常常在等一艘船，也常常在等一个人先开口。',
};

export function authorBio(name: string): string {
  const row = db.prepare('SELECT author_bio FROM users WHERE nickname = ? LIMIT 1').get(name) as { author_bio: string | null } | undefined;
  const custom = row?.author_bio?.trim();
  return custom || AUTHOR_BIOS[name] || '';
}

// 作者头像（账号自己上传的；种子作者没有）
export function authorAvatar(name: string): string | null {
  const row = db.prepare('SELECT avatar_url FROM users WHERE nickname = ? ORDER BY id LIMIT 1').get(name) as { avatar_url: string | null } | undefined;
  return row?.avatar_url || null;
}

export type AuthorResult = { name: string; works: number; chats: number; latest: number; bio: string; hue: number; avatar: string | null };

function heat(value: string): number {
  const number = Number(String(value).replace(/[^\d.]/g, '')) || 0;
  return String(value).includes('万') ? number * 10000 : number;
}

// 作者搜索：作者名命中，或其公开作品内容命中（比如搜「沈」能找到沈砚之的作者）。
export function searchAuthors(query: string, options: { hideNsfw?: boolean } = {}): AuthorResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows = db.prepare("SELECT * FROM characters WHERE status = 'published'").all() as DbCharacter[];
  const map = new Map<string, { works: number; chats: number; latest: number; matched: boolean }>();
  for (const row of rows) {
    const character = characterView(row);
    if (options.hideNsfw && character.nsfw) continue;
    const entry = map.get(character.author) ?? { works: 0, chats: 0, latest: 0, matched: false };
    entry.works += 1;
    entry.chats += heat(character.chats);
    entry.latest = Math.max(entry.latest, character.createdAt || 0);
    if (!entry.matched) {
      const hay = `${character.name} ${character.author} ${character.hook} ${character.description} ${character.tags.join(' ')}`.toLowerCase();
      entry.matched = hay.includes(q);
    }
    map.set(character.author, entry);
  }
  return [...map.entries()]
    .filter(([name, entry]) => name.toLowerCase().includes(q) || entry.matched)
    .map(([name, entry]) => ({ name, works: entry.works, chats: entry.chats, latest: entry.latest, bio: authorBio(name), hue: 210, avatar: authorAvatar(name) }))
    .sort((a, b) => b.works - a.works || a.name.localeCompare(b.name));
}
