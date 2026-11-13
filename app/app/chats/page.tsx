import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listChats } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { listCharacterViews, listOwnedCharacters } from '@/lib/characters';
import { ChatsBrowser } from '@/components/chats-browser';

export const metadata: Metadata = { title: '对话' };
export const dynamic = 'force-dynamic';

export default async function ChatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const chats = listChats(user.id).map((chat) => ({
    id: chat.id,
    characterId: chat.character_id,
    name: chat.character_name,
    initial: chat.character_initial,
    hue: chat.character_hue,
    ownerId: chat.character_owner,
    coverImage: null,
    title: chat.title,
    lastMessage: chat.last_message,
    lastMessageId: chat.last_message_id,
    count: chat.message_count,
    updatedAt: chat.updated_at,
  }));
  const rooms = listRooms(user.id).map((room) => ({
    id: room.id,
    name: room.name,
    lastMessage: room.lastMessage,
    count: 0,
    updatedAt: room.updatedAt,
  }));

  return (
    <div className="p-inner">
      <ChatsBrowser
        chats={chats}
        rooms={rooms}
        characters={[...new Map([...listCharacterViews(), ...listOwnedCharacters(user.id)].map((item) => [item.id, { id: item.id, name: item.name }])).values()]}
      />
    </div>
  );
}
