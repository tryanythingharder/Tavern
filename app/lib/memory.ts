import db, { touchChat, type DbChat, type DbMessage } from '@/lib/db';

// M3 长线能力：自动摘要、记忆检索（bigram 近似）、书签与聊天内搜索、备份恢复、导出。
// 摘要与检索的语义对齐原型：摘要只覆盖「最近 8 条」之前的部分；检索只从更早的历史里挑片段。

export const RECENT_WINDOW = 8;
const SUMMARY_INTERVAL_DEFAULT = 12;
const RAG_TOPK_DEFAULT = 3;
const BACKUP_LIMIT = 5;

export type SummaryState = { text: string; covered: number; source: 'auto' | 'manual'; updatedAt: number };
export type SummaryPrefs = { enabled: boolean; interval: number };
export type RagPrefs = { enabled: boolean; topK: number };

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function summaryState(chat: DbChat): SummaryState {
  const source = parseJson<Partial<SummaryState>>(chat.summary, {});
  return {
    text: typeof source.text === 'string' ? source.text : '',
    covered: Number.isFinite(Number(source.covered)) ? Number(source.covered) : 0,
    source: source.source === 'manual' ? 'manual' : 'auto',
    updatedAt: Number(source.updatedAt) || 0,
  };
}

export function summaryPrefs(chat: DbChat): SummaryPrefs {
  const source = parseJson<{ enabled?: boolean; interval?: number }>(chat.summary_prefs, {});
  const interval = Number(source.interval);
  return {
    enabled: source.enabled !== false,
    interval: Number.isFinite(interval) && interval >= 4 && interval <= 40 ? Math.round(interval) : SUMMARY_INTERVAL_DEFAULT,
  };
}

export function ragPrefs(chat: DbChat): RagPrefs {
  const source = parseJson<{ enabled?: boolean; topK?: number }>(chat.rag_prefs, {});
  const topK = Number(source.topK);
  return {
    enabled: source.enabled !== false,
    topK: Number.isFinite(topK) && topK >= 1 && topK <= 5 ? Math.round(topK) : RAG_TOPK_DEFAULT,
  };
}

export function generateSummaryText(characterName: string, messages: DbMessage[], upTo: number): string {
  const start = Math.max(0, upTo - 40);
  const lines: string[] = [];
  for (let index = start; index < upTo; index += 1) {
    const message = messages[index];
    if (!message || message.role === 'system') continue;
    const who = message.role === 'user' ? '你' : characterName;
    const first = String(message.content || '')
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean);
    if (!first) continue;
    lines.push(`${who}：${first.length > 38 ? `${first.slice(0, 36)}…` : first}`);
  }
  if (!lines.length) return '';
  return `【摘要 · 抽取式】\n${lines.slice(-30).join('\n')}`;
}

// 需要时刷新摘要（消息增长到间隔才更新），返回最新状态。
export function refreshSummary(chatId: number, characterName: string, messages: DbMessage[], force = false): SummaryState {
  const row = db.prepare('SELECT summary, summary_prefs FROM chats WHERE id = ?').get(chatId) as Pick<DbChat, 'summary' | 'summary_prefs'> | undefined;
  if (!row) return { text: '', covered: 0, source: 'auto', updatedAt: 0 };
  const prefs = summaryPrefs(row as DbChat);
  const current = summaryState(row as DbChat);
  const covered = Math.min(current.covered || 0, messages.length);
  // 手改过的摘要不再被自动刷新覆盖（除非用户点「刷新摘要」）
  if (!force && (current.source === 'manual' || !prefs.enabled || messages.length - RECENT_WINDOW - covered < prefs.interval)) return current;
  const upTo = Math.max(0, messages.length - RECENT_WINDOW);
  const text = generateSummaryText(characterName, messages, upTo);
  const next: SummaryState = { text, covered: upTo, source: 'auto', updatedAt: Date.now() };
  db.prepare('UPDATE chats SET summary = ? WHERE id = ?').run(JSON.stringify(next), chatId);
  return next;
}

export function summaryStatus(chat: DbChat, messageCount: number) {
  const prefs = summaryPrefs(chat);
  const state = summaryState(chat);
  const covered = Math.min(state.covered, messageCount);
  return {
    enabled: prefs.enabled,
    interval: prefs.interval,
    covered,
    behind: Math.max(0, messageCount - RECENT_WINDOW - covered),
    text: state.text,
    source: state.source,
    updatedAt: state.updatedAt,
  };
}

// ---------- 记忆检索 ----------

export function ragBigrams(text: string): Set<string> {
  const clean = String(text || '').toLowerCase().replace(/\s+/g, '');
  const grams = new Set<string>();
  for (let index = 0; index < clean.length - 1; index += 1) grams.add(clean.slice(index, index + 2));
  return grams;
}

export function ragChunks(messages: DbMessage[], query: string, topK = RAG_TOPK_DEFAULT): { index: number; role: string; text: string; score: number }[] {
  const grams = ragBigrams(query);
  if (!grams.size) return [];
  const cutoff = messages.length - RECENT_WINDOW;
  const scored: { index: number; role: string; text: string; score: number }[] = [];
  messages.forEach((message, index) => {
    if (index >= cutoff || message.role === 'system') return;
    const content = String(message.content || '').toLowerCase().replace(/\s+/g, '');
    if (!content) return;
    let hits = 0;
    for (const gram of grams) if (content.includes(gram)) hits += 1;
    if (hits < 2) return;
    scored.push({ index, role: message.role, text: message.content, score: hits / Math.sqrt(grams.size * Math.max(content.length, 1)) });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

// ---------- 会话记忆设置 ----------

export type MemorySettings = { summary: SummaryState; summaryPrefs: SummaryPrefs; ragPrefs: RagPrefs; memory: string };

export function memorySettings(chat: DbChat): MemorySettings {
  return { summary: summaryState(chat), summaryPrefs: summaryPrefs(chat), ragPrefs: ragPrefs(chat), memory: chat.memory ?? '' };
}

export function updateMemorySettings(
  chatId: number,
  userId: number,
  patch: { summaryEnabled?: boolean; summaryInterval?: number; summaryText?: string; ragEnabled?: boolean; ragTopK?: number; memory?: string },
): boolean {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId) as DbChat | undefined;
  if (!chat) return false;

  const prefs = summaryPrefs(chat);
  const rag = ragPrefs(chat);
  const nextSummaryPrefs: SummaryPrefs = {
    enabled: patch.summaryEnabled ?? prefs.enabled,
    interval: patch.summaryInterval === undefined ? prefs.interval : Math.max(4, Math.min(40, Math.round(patch.summaryInterval))),
  };
  const nextRag: RagPrefs = {
    enabled: patch.ragEnabled ?? rag.enabled,
    topK: patch.ragTopK === undefined ? rag.topK : Math.max(1, Math.min(5, Math.round(patch.ragTopK))),
  };
  const summary = patch.summaryText === undefined
    ? chat.summary
    : JSON.stringify({ ...summaryState(chat), text: patch.summaryText, source: 'manual', updatedAt: Date.now() });

  db.prepare('UPDATE chats SET summary = ?, summary_prefs = ?, rag_prefs = ?, memory = ? WHERE id = ? AND user_id = ?').run(
    summary,
    JSON.stringify(nextSummaryPrefs),
    JSON.stringify(nextRag),
    patch.memory === undefined ? chat.memory : patch.memory,
    chatId,
    userId,
  );
  return true;
}

// ---------- 书签与搜索 ----------

export function setBookmark(messageId: number, value: boolean): boolean {
  return Number(db.prepare('UPDATE messages SET bookmark = ? WHERE id = ?').run(value ? 1 : 0, messageId).changes) > 0;
}

export type SearchHit = { id: number; role: string; content: string; bookmark: number; created_at: number };

export function searchMessages(chatId: number, query: string, bookmarksOnly = false): SearchHit[] {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) {
    if (!bookmarksOnly) return [];
    return db.prepare('SELECT id, role, content, bookmark, created_at FROM messages WHERE chat_id = ? AND bookmark = 1 ORDER BY id DESC LIMIT 200').all(chatId) as SearchHit[];
  }
  const like = `%${trimmed.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const where = bookmarksOnly
    ? "chat_id = ? AND bookmark = 1 AND content LIKE ? ESCAPE '\\'"
    : "chat_id = ? AND content LIKE ? ESCAPE '\\'";
  return db.prepare(`SELECT id, role, content, bookmark, created_at FROM messages WHERE ${where} ORDER BY id DESC LIMIT 100`).all(chatId, like) as SearchHit[];
}

// ---------- 备份 ----------

export type BackupRow = { id: number; message_count: number; created_at: number };

type BackupPayloadRow = { role: string; content: string; candidates: string | null; selected: number; bookmark: number; attachment: string | null; created_at: number };

export function listBackups(chatId: number, userId: number): BackupRow[] {
  return db.prepare(`
        SELECT b.id, b.message_count, b.created_at FROM chat_backups b
        JOIN chats c ON c.id = b.chat_id
        WHERE b.chat_id = ? AND c.user_id = ?
        ORDER BY b.id DESC
    `).all(chatId, userId) as BackupRow[];
}

// 消息数变化时留一份快照；force 用于恢复前保留现场。
export function snapshotChat(chatId: number, userId: number, force = false): number | null {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId);
  if (!chat) return null;
  const messages = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id').all(chatId) as DbMessage[];
  if (!messages.length) return null;
  const last = db.prepare('SELECT message_count FROM chat_backups WHERE chat_id = ? ORDER BY id DESC LIMIT 1').get(chatId) as { message_count: number } | undefined;
  if (!force && last && last.message_count === messages.length) return null;

  const payload = JSON.stringify(messages.map((message) => ({
    role: message.role,
    content: message.content,
    candidates: message.candidates,
    selected: message.selected,
    bookmark: message.bookmark,
    attachment: message.attachment,
    created_at: message.created_at,
  })));
  const result = db.prepare('INSERT INTO chat_backups (chat_id, user_id, message_count, payload, created_at) VALUES (?,?,?,?,?)').run(chatId, userId, messages.length, payload, Date.now());
  db.prepare(`
        DELETE FROM chat_backups WHERE chat_id = ? AND id NOT IN (
            SELECT id FROM chat_backups WHERE chat_id = ? ORDER BY id DESC LIMIT ?
        )
    `).run(chatId, chatId, BACKUP_LIMIT);
  return Number(result.lastInsertRowid);
}

export function restoreBackup(chatId: number, userId: number, backupId: number): boolean {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId);
  if (!chat) return false;
  const backup = db.prepare('SELECT payload FROM chat_backups WHERE id = ? AND chat_id = ?').get(backupId, chatId) as { payload: string } | undefined;
  if (!backup) return false;
  const rows = parseJson<BackupPayloadRow[]>(backup.payload, []);
  if (!rows.length) return false;

  snapshotChat(chatId, userId, true); // 恢复本身也可撤销
  const remove = db.prepare('DELETE FROM messages WHERE chat_id = ?');
  const insert = db.prepare('INSERT INTO messages (chat_id, role, content, candidates, selected, bookmark, attachment, created_at) VALUES (?,?,?,?,?,?,?,?)');
  remove.run(chatId);
  for (const row of rows) {
    insert.run(chatId, row.role, row.content, row.candidates ?? null, row.selected ?? 0, row.bookmark ?? 0, row.attachment ?? null, row.created_at ?? Date.now());
  }
  touchChat(chatId);
  return true;
}

// ---------- 导出 ----------

export function exportChat(chat: DbChat, characterName: string, messages: DbMessage[], format: 'txt' | 'jsonl'): string {
  if (format === 'jsonl') {
    return messages
      .map((message) =>
        JSON.stringify({
          chat: chat.title,
          role: message.role,
          name: message.role === 'user' ? '你' : characterName,
          content: message.content,
          candidates: messageCandidatesOf(message),
          selected: message.selected,
          bookmark: message.bookmark === 1,
          attachment: message.attachment ? JSON.parse(message.attachment) : null,
          created_at: message.created_at,
        }),
      )
      .join('\n');
  }
  const header = `# ${chat.title}\n# 角色：${characterName} · 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  return (
    header +
    messages
      .map((message) => {
        const who = message.role === 'user' ? '你' : message.role === 'system' ? '系统' : characterName;
        const attachment = message.attachment ? (JSON.parse(message.attachment) as { kind?: string; url?: string }) : null;
        const suffix = attachment?.url ? `\n[${attachment.kind === 'audio' ? '语音' : '图片'}] ${attachment.url}` : '';
        return `${who}：${message.content}${suffix}`;
      })
      .join('\n\n')
  );
}

function messageCandidatesOf(message: DbMessage): string[] {
  if (!message.candidates) return [];
  try {
    const list = JSON.parse(message.candidates);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}
