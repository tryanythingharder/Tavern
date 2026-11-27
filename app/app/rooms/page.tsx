import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUseCharacter, listCharacters } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { RoomsList } from '@/components/rooms-list';
import { nsfwAccess } from '@/lib/age-gate';
import { builtinArtUrl } from '@/lib/cover-url';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const rooms = listRooms(user.id);
  // 18+ 卡：不能看的人在选成员列表里看不到（名字、立绘都不给；建房/发言另有 roomNsfwBlock 兜底）
  const canSee18 = (await nsfwAccess(user.id)).allowed;
  const usable = listCharacters()
    .filter((character) => canSee18 || character.nsfw !== 1 || character.owner_id === user.id)
    .filter((character) => canUseCharacter(user.id, character) || rooms.some((room) => room.characterIds.includes(character.id)));
  // 同名卡（比如两张「清月师尊」）在成员列表里补一个区分：作者不同标作者，同一作者标第几张
  const sameName = new Map<string, typeof usable>();
  for (const character of usable) sameName.set(character.name, [...(sameName.get(character.name) ?? []), character]);
  const tagOf = (character: (typeof usable)[number]): string | undefined => {
    const group = sameName.get(character.name) ?? [];
    if (group.length < 2) return undefined;
    const authors = new Set(group.map((item) => item.author));
    return authors.size === group.length ? `@${character.author}` : `#${group.indexOf(character) + 1}`;
  };
  const characters = usable.map((character) => ({ id: character.id, name: character.name, author: tagOf(character), initial: character.initial, hue: character.hue, avatar: character.avatar_image || character.cover_image || (character.owner_id === null ? builtinArtUrl(character.id) : null) }));

  return (
    <div className="p-inner">
      <RoomsList rooms={rooms} characters={characters} />
    </div>
  );
}
