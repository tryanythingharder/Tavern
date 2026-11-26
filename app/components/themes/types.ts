import { coverOriginalUrl, coverSrcSet, thumbOf } from '@/lib/cover-url';
export { coverSrcSet };
import type { CharacterView } from '@/lib/characters';

// 首页三套主题共用的数据。page.tsx 负责查询，主题组件只负责呈现。
export type HomeChat = {
  id: number;
  title: string;
  characterId: string;
  characterName: string;
  characterInitial: string;
  characterHue: number;
  characterOwner: number | null;
  lastMessage: string | null;
  messageCount: number;
};

export type HomeRoom = { id: number; name: string; lastMessage: string | null };

export type HomeData = {
  userName: string | null;
  returning: boolean;
  featured: CharacterView | undefined;
  /** 有封面图或内置立绘的角色（主视觉可用），featured 在前 */
  showcase: CharacterView[];
  /** 推荐：featured + 非 18+，最多 4 个 */
  recs: CharacterView[];
  /** 全部非 18+ 角色 */
  grid: CharacterView[];
  /** 全部角色（含 18+，按用户设置已过滤） */
  all: CharacterView[];
  chats: HomeChat[];
  rooms: HomeRoom[];
  categories: string[];
};

/** 角色封面地址：上传封面 > 内置立绘 > 无（原图，头图等大幅用） */
export function coverUrl(character: { id: string; coverImage?: string | null; ownerId: number | null }): string | null {
  return coverOriginalUrl(character);
}

/** 缩略图（卡片、书签、海报列表等小图用） */
export function coverThumbUrl(character: { id: string; coverImage?: string | null; ownerId: number | null }): string | null {
  return thumbOf(coverOriginalUrl(character));
}
