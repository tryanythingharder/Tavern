import db from '@/lib/db';
import { notify } from '@/lib/notifications';

// 关注创作者：作者在本平台以署名（characters.author）标识，所以按名字关注。
// 作品通过审核首次上架时，给关注者发一条站内通知。

db.exec(`
  CREATE TABLE IF NOT EXISTS author_follows (
    user_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, author)
  );
  CREATE INDEX IF NOT EXISTS idx_author_follows_author ON author_follows(author);
`);

export function isFollowing(userId: number, author: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM author_follows WHERE user_id = ? AND author = ?').get(userId, author));
}

export function followerCount(author: string): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM author_follows WHERE author = ?').get(author) as { n: number }).n;
}

export function setFollow(userId: number, author: string, follow: boolean): { following: boolean; followers: number } {
  const name = author.trim().slice(0, 60);
  if (follow) db.prepare('INSERT OR IGNORE INTO author_follows (user_id, author, created_at) VALUES (?,?,?)').run(userId, name, Date.now());
  else db.prepare('DELETE FROM author_follows WHERE user_id = ? AND author = ?').run(userId, name);
  return { following: isFollowing(userId, name), followers: followerCount(name) };
}

export function followedAuthors(userId: number): string[] {
  return (db.prepare('SELECT author FROM author_follows WHERE user_id = ? ORDER BY created_at DESC').all(userId) as { author: string }[]).map((row) => row.author);
}

/** 新作上架：通知关注者（不通知作者本人）。返回通知人数。 */
export function notifyFollowers(author: string, character: { id: string; name: string; hook?: string }, exceptUserId?: number): number {
  const rows = db.prepare('SELECT user_id FROM author_follows WHERE author = ?').all(author) as { user_id: number }[];
  let sent = 0;
  for (const { user_id } of rows) {
    if (user_id === exceptUserId) continue;
    notify(user_id, {
      type: 'follow',
      title: `${author} 发布了新角色「${character.name}」`,
      body: character.hook ? character.hook.slice(0, 80) : '去看看这段新故事。',
      link: `/c/${character.id}`,
    });
    sent += 1;
  }
  return sent;
}
