import { getCurrentUser } from '@/lib/auth';
import { listCharacterViews, CATEGORIES } from '@/lib/characters';
import { listChats } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { hideNsfw } from '@/lib/prefs';
import { getTheme } from '@/lib/theme';
import type { HomeData } from '@/components/themes/types';
import { FolioHome } from '@/components/themes/folio/home';
import { StageHome } from '@/components/themes/stage/home';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  const theme = await getTheme();
  const all = listCharacterViews(undefined, { hideNsfw: hideNsfw(user?.id ?? null) });
  // 与原型一致：推荐/场景/全部角色默认排除 18+（主角位单独放 featured）
  const featured = all.find((character) => character.id === 'shen-yanzhi') ?? all.find((character) => !character.nsfw) ?? all[0];
  const safe = all.filter((character) => !character.nsfw && character.id !== featured?.id);
  const chats = user ? listChats(user.id).slice(0, 4) : [];
  const rooms = user ? listRooms(user.id).slice(0, 3) : [];
  const data: HomeData = {
    userName: user?.nickname ?? null,
    returning: chats.length > 0,
    featured,
    showcase: [...(featured ? [featured] : []), ...safe].filter((character) => character.coverImage || character.ownerId === null).slice(0, 6),
    recs: [...(featured ? [featured] : []), ...safe].slice(0, 4),
    grid: all.filter((character) => !character.nsfw),
    all,
    chats: chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      characterId: chat.character_id,
      characterName: chat.character_name,
      characterInitial: chat.character_initial,
      characterHue: chat.character_hue,
      characterOwner: chat.character_owner,
      lastMessage: chat.last_message,
      messageCount: chat.message_count,
    })),
    rooms: rooms.map((room) => ({ id: room.id, name: room.name, lastMessage: room.lastMessage })),
    categories: [...CATEGORIES],
  };

  if (theme === 'stage') return <StageHome data={data} />;
  return <FolioHome data={data} />;
}
