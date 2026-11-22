import db from '@/lib/db';
import { PLATFORM_TZ, dayKeyIn, shiftDayKey, startOfDayIn } from '@/lib/tz';

// 创作者数据：只统计作者本人以外的玩家（作者自测的对话不算）。
// 按天分桶用玩家浏览器上报的时区（lib/tz.ts requestTimeZone，页面传进来）。

export type WorkStats = {
  id: string;
  name: string;
  status: string;
  players: number;
  chats: number;
  playerMessages: number;
  favorites: number;
  comments: number;
  newChats: number; // 选定区间内新开的对话
  avgTurns: number; // 每段对话平均玩家发言数
};

export type CreatorStats = {
  days: number;
  totals: { players: number; chats: number; playerMessages: number; favorites: number; comments: number; followers: number; newChats: number; newFavorites: number; newPlayers: number };
  daily: { day: string; chats: number; messages: number }[];
  works: WorkStats[];
};




export function creatorStats(ownerId: number, days: 7 | 30 = 7, tz: string = PLATFORM_TZ): CreatorStats {
  const dayKey = (ms: number) => dayKeyIn(ms, tz);
  const works = db.prepare("SELECT id, name, status, author FROM characters WHERE owner_id = ? AND status != 'deleted' ORDER BY created_at DESC")
    .all(ownerId) as { id: string; name: string; status: string; author: string }[];
  const ids = works.map((w) => w.id);
  const todayKey = dayKeyIn(Date.now(), tz);
  const since = startOfDayIn(Date.parse(shiftDayKey(todayKey, -(days - 1)) + 'T12:00:00Z'), tz);

  const emptyTotals = { players: 0, chats: 0, playerMessages: 0, favorites: 0, comments: 0, followers: 0, newChats: 0, newFavorites: 0, newPlayers: 0 };
  const daily = Array.from({ length: days }, (_, i) => ({ day: shiftDayKey(dayKey(since + 12 * 3600_000), i), chats: 0, messages: 0 }));
  if (!ids.length) return { days, totals: emptyTotals, daily, works: [] };

  const ph = ids.map(() => '?').join(',');
  const perChat = db.prepare(`SELECT character_id AS cid, COUNT(*) AS chats, COUNT(DISTINCT user_id) AS players,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS newChats
    FROM chats WHERE character_id IN (${ph}) AND user_id != ? GROUP BY character_id`).all(since, ...ids, ownerId) as { cid: string; chats: number; players: number; newChats: number }[];
  const perMsg = db.prepare(`SELECT c.character_id AS cid, COUNT(*) AS n FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE c.character_id IN (${ph}) AND c.user_id != ? AND m.role = 'user' GROUP BY c.character_id`).all(...ids, ownerId) as { cid: string; n: number }[];
  const perFav = db.prepare(`SELECT character_id AS cid, COUNT(*) AS n, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent
    FROM character_favorites WHERE character_id IN (${ph}) AND user_id != ? GROUP BY character_id`).all(since, ...ids, ownerId) as { cid: string; n: number; recent: number }[];
  const perComment = db.prepare(`SELECT character_id AS cid, COUNT(*) AS n FROM comments
    WHERE character_id IN (${ph}) AND user_id != ? AND status = 'visible' GROUP BY character_id`).all(...ids, ownerId) as { cid: string; n: number }[];

  const by = <T extends { cid: string }>(rows: T[]) => new Map(rows.map((r) => [r.cid, r]));
  const chatMap = by(perChat); const msgMap = by(perMsg); const favMap = by(perFav); const comMap = by(perComment);

  const workRows: WorkStats[] = works.map((w) => {
    const c = chatMap.get(w.id); const chats = c?.chats ?? 0; const msgs = msgMap.get(w.id)?.n ?? 0;
    return {
      id: w.id, name: w.name, status: w.status,
      players: c?.players ?? 0, chats, playerMessages: msgs,
      favorites: favMap.get(w.id)?.n ?? 0, comments: comMap.get(w.id)?.n ?? 0,
      newChats: c?.newChats ?? 0, avgTurns: chats ? Math.round((msgs / chats) * 10) / 10 : 0,
    };
  }).sort((a, b) => b.newChats - a.newChats || b.chats - a.chats);

  const distinct = db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM chats WHERE character_id IN (${ph}) AND user_id != ?`).get(...ids, ownerId) as { n: number };
  // 区间内第一次玩到该作者作品的玩家
  const fresh = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT user_id, MIN(created_at) AS first FROM chats WHERE character_id IN (${ph}) AND user_id != ? GROUP BY user_id) WHERE first >= ?`).get(...ids, ownerId, since) as { n: number };
  const authors = [...new Set(works.map((w) => w.author))];
  const followers = authors.length
    ? (db.prepare(`SELECT COUNT(DISTINCT user_id) AS n FROM author_follows WHERE author IN (${authors.map(() => '?').join(',')}) AND user_id != ?`).get(...authors, ownerId) as { n: number }).n
    : 0;

  const chatDays = db.prepare(`SELECT created_at FROM chats WHERE character_id IN (${ph}) AND user_id != ? AND created_at >= ?`).all(...ids, ownerId, since) as { created_at: number }[];
  const msgDays = db.prepare(`SELECT m.created_at FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE c.character_id IN (${ph}) AND c.user_id != ? AND m.role = 'user' AND m.created_at >= ?`).all(...ids, ownerId, since) as { created_at: number }[];
  const index = new Map(daily.map((d, i) => [d.day, i]));
  for (const r of chatDays) { const i = index.get(dayKey(r.created_at)); if (i !== undefined) daily[i].chats += 1; }
  for (const r of msgDays) { const i = index.get(dayKey(r.created_at)); if (i !== undefined) daily[i].messages += 1; }

  const sum = (k: keyof WorkStats) => workRows.reduce((s, w) => s + (w[k] as number), 0);
  return {
    days,
    totals: {
      players: distinct.n, chats: sum('chats'), playerMessages: sum('playerMessages'), favorites: sum('favorites'), comments: sum('comments'),
      followers, newChats: sum('newChats'), newFavorites: perFav.reduce((s, r) => s + (r.recent ?? 0), 0), newPlayers: fresh.n,
    },
    daily,
    works: workRows,
  };
}
