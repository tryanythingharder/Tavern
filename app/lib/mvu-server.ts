import db from '@/lib/db';
import { loadExtras } from '@/lib/card-extras';
import { initialStat, replay, type Floor } from '@/lib/mvu';
import { readHelperVars } from '@/lib/helper-vars';

// 某个会话在某一楼之后的 MVU 变量（见 lib/mvu.ts）。卡里没有 InitVar、回复里也没出现过命令时 active=false。
// uptoId：到这一楼（含）为止；beforeId：到这一楼之前（重新生成时用）。都不给 = 最新。
export function chatVariables(chatId: number, characterId: string, opts: { uptoId?: number; beforeId?: number; extraEntries?: { title: string; text: string }[] } = {}) {
  const extras = loadExtras(characterId);
  const entries = [...(extras.book?.entries ?? []), ...(opts.extraEntries ?? [])];
  const initial = initialStat(entries);
  const floors = db.prepare('SELECT id, role, content FROM messages WHERE chat_id = ? ORDER BY id').all(chatId) as Floor[];
  const upto = opts.uptoId ?? (opts.beforeId !== undefined ? opts.beforeId - 1 : undefined);
  const state = replay(initial, floors, upto);
  const owner = db.prepare('SELECT user_id FROM chats WHERE id = ?').get(chatId) as { user_id: number } | undefined;
  const scoped = owner ? { chat: readHelperVars(owner.user_id, 'chat', String(chatId)) ?? undefined, global: readHelperVars(owner.user_id, 'global', '') ?? undefined } : undefined;
  return { ...state, scoped };
}
