import { listChats } from '@/lib/db';
import { listAddedCharacters, listFavoriteCharacters, listOwnedCharacters, type CharacterView } from '@/lib/characters';

/** 玩家角色库里的全部角色（已添加 + 我创建的 + 收藏），去重 */
export function libraryCharacters(userId: number): CharacterView[] {
  const seen = new Map<string, CharacterView>();
  for (const item of [...listAddedCharacters(userId), ...listOwnedCharacters(userId), ...listFavoriteCharacters(userId)]) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return [...seen.values()];
}

export function libraryNames(userId: number): { id: string; name: string }[] {
  const list = libraryCharacters(userId).map((c) => ({ id: c.id, name: c.name }));
  const ids = new Set(list.map((c) => c.id));
  for (const chat of listChats(userId)) {
    if (!ids.has(chat.character_id)) {
      ids.add(chat.character_id);
      list.push({ id: chat.character_id, name: chat.character_name });
    }
  }
  return list;
}
