import db, { touchChat, type DbChat, type DbMessage } from '@/lib/db';

// M3 长线能力：自动摘要、记忆检索（bigram 近似）、作者注释、书签与聊天内搜索、备份恢复、导出。
// 摘要对齐 ST 的 Summarize 扩展：默认用当前模型生成（lib/memory-llm.ts），提示词/字数/注入位置/注入模板可改，
// 也有 {{summary}} 宏；模型不可用时可切回「抽取式」（只取每条第一行，不花点数）。
// 作者注释对齐 ST 的 Author's Note：会话注释 + 角色注释，位置（主提示后/主提示前/聊天内 @深度）、角色、插入频率。

export const RECENT_WINDOW = 8;
const SUMMARY_INTERVAL_DEFAULT = 12;
const RAG_TOPK_DEFAULT = 3;
const BACKUP_LIMIT = 5;

export type Role = 'system' | 'user' | 'assistant';
export type SummaryState = { text: string; covered: number; source: 'auto' | 'manual'; updatedAt: number; error?: string };
export type SummaryMode = 'llm' | 'extract';
export type SummaryPosition = 'prompt' | 'depth' | 'none';
export type SummaryPrefs = {
  enabled: boolean;
  interval: number;
  mode: SummaryMode;
  /** prompt = 预设里「自动摘要」块的位置；depth = 聊天内 @深度；none = 不自动注入，只能用 {{summary}} 宏 */
  position: SummaryPosition;
  depth: number;
  role: Role;
  /** 注入模板，{{summary}} 换成摘要正文（ST 默认 [Summary: {{summary}}]） */
  template: string;
  /** 生成摘要用的提示词，{{words}} 换成字数上限 */
  prompt: string;
  words: number;
};
export type RagPrefs = { enabled: boolean; topK: number };

export const SUMMARY_PROMPT_DEFAULT = '忽略之前的指令。用简洁的语言概括到目前为止故事里最重要的事实和事件：人物关系、关键事件、承诺与伏笔、当前所在地点与状态。如果已经有摘要，在它的基础上更新并补充新的内容，删掉已经过时的。控制在 {{words}} 字以内。只输出摘要正文，不要别的内容。';
export const SUMMARY_TEMPLATE_DEFAULT = '[前情摘要：{{summary}}]';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const roleOf = (value: unknown): Role => (value === 'user' || value === 'assistant' ? value : 'system');

export function summaryState(chat: Pick<DbChat, 'summary'>): SummaryState {
  const source = parseJson<Partial<SummaryState>>(chat.summary, {});
  return {
    text: typeof source.text === 'string' ? source.text : '',
    covered: Number.isFinite(Number(source.covered)) ? Number(source.covered) : 0,
    source: source.source === 'manual' ? 'manual' : 'auto',
    updatedAt: Number(source.updatedAt) || 0,
    ...(typeof source.error === 'string' && source.error ? { error: source.error } : {}),
  };
}

export function summaryPrefs(chat: Pick<DbChat, 'summary_prefs'>): SummaryPrefs {
  const source = parseJson<Partial<SummaryPrefs>>(chat.summary_prefs, {});
  return {
    enabled: source.enabled !== false,
    interval: clampInt(source.interval, 4, 100, SUMMARY_INTERVAL_DEFAULT),
    // 旧会话没有 mode：沿用抽取式，免得升级后突然开始扣点数
    mode: source.mode === 'llm' ? 'llm' : source.mode === 'extract' ? 'extract' : chat.summary_prefs ? 'extract' : 'llm',
    position: source.position === 'depth' || source.position === 'none' ? source.position : 'prompt',
    depth: clampInt(source.depth, 0, 999, 2),
    role: roleOf(source.role),
    template: typeof source.template === 'string' ? source.template.slice(0, 2000) : SUMMARY_TEMPLATE_DEFAULT,
    prompt: typeof source.prompt === 'string' && source.prompt.trim() ? source.prompt.slice(0, 4000) : SUMMARY_PROMPT_DEFAULT,
    words: clampInt(source.words, 50, 2000, 300),
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
    const who = message.role === 'user' ? message.persona_name || '你' : characterName;
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

// 抽取式摘要：发送前按间隔同步刷新。模型摘要不在这里跑（见 lib/memory-llm.ts，回复落库后后台跑）。
export function refreshSummary(chatId: number, characterName: string, messages: DbMessage[], force = false): SummaryState {
  const row = db.prepare('SELECT summary, summary_prefs FROM chats WHERE id = ?').get(chatId) as Pick<DbChat, 'summary' | 'summary_prefs'> | undefined;
  if (!row) return { text: '', covered: 0, source: 'auto', updatedAt: 0 };
  const prefs = summaryPrefs(row);
  const current = summaryState(row);
  if (prefs.mode === 'llm' && !force) return current;
  const covered = Math.min(current.covered || 0, messages.length);
  // 手改过的摘要不再被自动刷新覆盖（除非用户点「刷新摘要」）
  if (!force && (current.source === 'manual' || !prefs.enabled || messages.length - RECENT_WINDOW - covered < prefs.interval)) return current;
  const upTo = Math.max(0, messages.length - RECENT_WINDOW);
  const text = generateSummaryText(characterName, messages, upTo);
  const next: SummaryState = { text, covered: upTo, source: 'auto', updatedAt: Date.now() };
  db.prepare('UPDATE chats SET summary = ? WHERE id = ?').run(JSON.stringify(next), chatId);
  return next;
}

export function saveSummaryState(chatId: number, state: SummaryState): void {
  db.prepare('UPDATE chats SET summary = ? WHERE id = ?').run(JSON.stringify(state), chatId);
}

export function summaryStatus(chat: DbChat, messageCount: number) {
  const prefs = summaryPrefs(chat);
  const state = summaryState(chat);
  const covered = Math.min(state.covered, messageCount);
  return {
    ...prefs,
    covered,
    behind: Math.max(0, messageCount - (prefs.mode === 'llm' ? 0 : RECENT_WINDOW) - covered),
    text: state.text,
    source: state.source,
    updatedAt: state.updatedAt,
    error: state.error ?? '',
  };
}

// ---------- 作者注释（ST Author's Note） ----------

export type NotePosition = 'after' | 'before' | 'depth';
export type AuthorNote = { text: string; position: NotePosition; depth: number; role: Role; interval: number };
export type CharacterNoteMode = 'replace' | 'before' | 'after';
export type CharacterNote = { text: string; mode: CharacterNoteMode };

export function authorNote(chat: Pick<DbChat, 'author_note'>): AuthorNote {
  const source = parseJson<Partial<AuthorNote>>(chat.author_note, {});
  return {
    text: typeof source.text === 'string' ? source.text.slice(0, 20000) : '',
    // ST 默认：聊天内 @4，system，每 1 条都插入
    position: source.position === 'after' || source.position === 'before' ? source.position : 'depth',
    depth: clampInt(source.depth, 0, 999, 4),
    role: roleOf(source.role),
    interval: clampInt(source.interval, 0, 999, 1),
  };
}

export function characterNote(userId: number, characterId: string): CharacterNote {
  const row = db.prepare('SELECT text, mode FROM character_notes WHERE user_id = ? AND character_id = ?').get(userId, characterId) as { text: string; mode: string } | undefined;
  return { text: row?.text ?? '', mode: row?.mode === 'before' || row?.mode === 'after' ? row.mode : 'replace' };
}

export function saveCharacterNote(userId: number, characterId: string, note: CharacterNote): void {
  if (!note.text.trim()) {
    db.prepare('DELETE FROM character_notes WHERE user_id = ? AND character_id = ?').run(userId, characterId);
    return;
  }
  db.prepare(`INSERT INTO character_notes (user_id, character_id, text, mode, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, character_id) DO UPDATE SET text = excluded.text, mode = excluded.mode, updated_at = excluded.updated_at`)
    .run(userId, characterId, note.text.slice(0, 20000), note.mode, Date.now());
}

/** ST：角色注释「替换」= 有角色注释时用它代替会话注释；「之前/之后」= 两段拼在一起 */
export function combinedNoteText(chatNote: string, charNote: CharacterNote): string {
  const own = chatNote.trim();
  const other = charNote.text.trim();
  if (!other) return own;
  if (charNote.mode === 'replace' || !own) return other;
  return charNote.mode === 'before' ? `${other}\n${own}` : `${own}\n${other}`;
}

// 组装提示词时要的记忆相关输入，四个生成入口共用
export type PromptMemory = {
  summary: string;
  summaryPlacement: { position: SummaryPosition; depth: number; role: Role; template: string };
  memory: string;
  authorNote: AuthorNote;
};

export function promptMemory(chat: DbChat, userId: number): PromptMemory {
  const prefs = summaryPrefs(chat);
  const state = summaryState(chat);
  const note = authorNote(chat);
  return {
    summary: prefs.enabled ? state.text : '',
    summaryPlacement: { position: prefs.position, depth: prefs.depth, role: prefs.role, template: prefs.template },
    memory: chat.memory ?? '',
    authorNote: { ...note, text: combinedNoteText(note.text, characterNote(userId, chat.character_id)) },
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

// ---------- 会话记忆设置 ----------

export type MemorySettings = { summary: SummaryState; summaryPrefs: SummaryPrefs; ragPrefs: RagPrefs; memory: string };

export function memorySettings(chat: DbChat): MemorySettings {
  return { summary: summaryState(chat), summaryPrefs: summaryPrefs(chat), ragPrefs: ragPrefs(chat), memory: chat.memory ?? '' };
}

export type MemoryPatch = {
  summaryEnabled?: boolean;
  summaryInterval?: number;
  summaryText?: string;
  summaryMode?: SummaryMode;
  summaryPosition?: SummaryPosition;
  summaryDepth?: number;
  summaryRole?: Role;
  summaryTemplate?: string;
  summaryPrompt?: string;
  summaryWords?: number;
  ragEnabled?: boolean;
  ragTopK?: number;
  memory?: string;
  note?: Partial<AuthorNote>;
};

export function updateMemorySettings(chatId: number, userId: number, patch: MemoryPatch): boolean {
  const chat = db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId) as DbChat | undefined;
  if (!chat) return false;

  const prefs = summaryPrefs(chat);
  const rag = ragPrefs(chat);
  const nextSummaryPrefs: SummaryPrefs = summaryPrefs({
    summary_prefs: JSON.stringify({
      ...prefs,
      enabled: patch.summaryEnabled ?? prefs.enabled,
      interval: patch.summaryInterval ?? prefs.interval,
      mode: patch.summaryMode ?? prefs.mode,
      position: patch.summaryPosition ?? prefs.position,
      depth: patch.summaryDepth ?? prefs.depth,
      role: patch.summaryRole ?? prefs.role,
      template: patch.summaryTemplate ?? prefs.template,
      prompt: patch.summaryPrompt ?? prefs.prompt,
      words: patch.summaryWords ?? prefs.words,
    }),
  });
  const nextRag: RagPrefs = {
    enabled: patch.ragEnabled ?? rag.enabled,
    topK: patch.ragTopK === undefined ? rag.topK : Math.max(1, Math.min(5, Math.round(patch.ragTopK))),
  };
  const current = summaryState(chat);
  const summary = patch.summaryText === undefined || patch.summaryText === current.text
    ? chat.summary
    : JSON.stringify({ ...current, text: patch.summaryText, source: 'manual', updatedAt: Date.now(), error: undefined });
  const note = patch.note ? JSON.stringify(authorNote({ author_note: JSON.stringify({ ...authorNote(chat), ...patch.note }) })) : chat.author_note ?? null;

  db.prepare('UPDATE chats SET summary = ?, summary_prefs = ?, rag_prefs = ?, memory = ?, author_note = ? WHERE id = ? AND user_id = ?').run(
    summary,
    JSON.stringify(nextSummaryPrefs),
    JSON.stringify(nextRag),
    patch.memory === undefined ? chat.memory : patch.memory,
    note,
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

type BackupPayloadRow = { role: string; content: string; candidates: string | null; selected: number; bookmark: number; attachment: string | null; created_at: number; persona_name?: string | null; persona_avatar?: string | null; reasoning?: string | null };

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
    persona_name: message.persona_name ?? null,
    persona_avatar: message.persona_avatar ?? null,
    reasoning: message.reasoning ?? null,
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
  const insert = db.prepare('INSERT INTO messages (chat_id, role, content, candidates, selected, bookmark, attachment, persona_name, persona_avatar, reasoning, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  remove.run(chatId);
  for (const row of rows) {
    insert.run(chatId, row.role, row.content, row.candidates ?? null, row.selected ?? 0, row.bookmark ?? 0, row.attachment ?? null, row.persona_name ?? null, row.persona_avatar ?? null, row.reasoning ?? null, row.created_at ?? Date.now());
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
          name: message.role === 'user' ? message.persona_name || '你' : characterName,
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
        const who = message.role === 'user' ? message.persona_name || '你' : message.role === 'system' ? '系统' : characterName;
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
