import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listChats } from '@/lib/db';
import { listAddedCharacters, listFavoriteCharacters, listOwnedCharacters } from '@/lib/characters';
import { LibraryBrowser } from '@/components/library-browser';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const added = listAddedCharacters(user.id);
  const works = listOwnedCharacters(user.id);
  const favorites = listFavoriteCharacters(user.id);

  // 每个角色最近的一条会话：用于「继续故事」
  const latestChats: Record<string, number> = {};
  for (const chat of listChats(user.id)) {
    if (!latestChats[chat.character_id]) latestChats[chat.character_id] = chat.id;
  }

  return (
    <div className="p-inner">
      <LibraryBrowser added={added} works={works} favorites={favorites} latestChats={latestChats} />
    </div>
  );
}
