import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import db, { listChats } from '@/lib/db';
import { listAddedCharacters, listFavoriteCharacters, listOwnedCharacters } from '@/lib/characters';
import { listTags, tagMap } from '@/lib/char-tags';
import { LibraryBrowser, type ChatStat } from '@/components/library-browser';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const added = listAddedCharacters(user.id);
  const works = listOwnedCharacters(user.id);
  const favorites = listFavoriteCharacters(user.id);
  const favoriteIds = (db.prepare('SELECT character_id FROM character_favorites WHERE user_id = ?').all(user.id) as { character_id: string }[]).map((row) => row.character_id);
  const addedAt: Record<string, number> = {};
  for (const row of db.prepare('SELECT character_id, created_at FROM character_added WHERE user_id = ?').all(user.id) as { character_id: string; created_at: number }[]) {
    addedAt[row.character_id] = row.created_at;
  }

  // 每个角色最近的一条会话：用于「继续故事」；以及聊天次数/最后聊天时间（排序用，ST 的「最近聊天」「聊天最多」）
  const stats: Record<string, ChatStat> = {};
  const chatted: { id: string; name: string }[] = [];
  const addedIds = new Set(added.map((item) => item.id));
  for (const chat of listChats(user.id)) {
    const stat = stats[chat.character_id];
    if (!stat) {
      stats[chat.character_id] = { latest: chat.id, lastAt: chat.updated_at, chats: 1, messages: chat.message_count };
      if (!addedIds.has(chat.character_id) && chatted.length < 6) chatted.push({ id: chat.character_id, name: chat.character_name });
    } else {
      stat.chats += 1;
      stat.messages += chat.message_count;
    }
  }

  return (
    <div className="p-inner">
      <LibraryBrowser
        added={added}
        works={works}
        favorites={favorites}
        favoriteIds={favoriteIds}
        addedAt={addedAt}
        stats={stats}
        chatted={chatted}
        initialTags={listTags(user.id)}
        initialMap={tagMap(user.id)}
        userId={user.id}
      />
    </div>
  );
}
