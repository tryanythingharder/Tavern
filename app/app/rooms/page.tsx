import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listCharacters } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { RoomsList } from '@/components/rooms-list';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const rooms = listRooms(user.id);
  const characters = listCharacters().map((character) => ({ id: character.id, name: character.name, initial: character.initial, hue: character.hue, avatar: character.avatar_image || character.cover_image || (character.owner_id === null ? `/characters/${character.id}.jpg` : null) }));

  return (
    <div className="p-inner">
      <RoomsList rooms={rooms} characters={characters} />
    </div>
  );
}
