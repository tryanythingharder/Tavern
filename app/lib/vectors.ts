import crypto from 'node:crypto';
import db, { type DbMessage } from '@/lib/db';
import { getSetting, hasSetting } from '@/lib/settings';
import { RECENT_WINDOW, ragChunks, type RagPrefs } from '@/lib/memory';

// 向量记忆：对齐 ST 的 Vector Storage（聊天消息向量化）。
// - 后台配置 OpenAI 兼容的 /embeddings（embed.baseUrl / embed.apiKey / embed.model）后启用；没配时退回字符 bigram 关键词检索。
// - 楼层向量按「内容哈希 + 模型」缓存在 message_vectors，内容改了（编辑、换候选）自动重算。
// - 查询 = 最近 queryMessages 条消息（ST 默认 2）；只从最近 RECENT_WINDOW 条之前的历史里挑；
//   相似度 ≥ threshold 的取 topK，按楼层先后顺序插入（ST 也是按时间顺序插入）。
// - 每次最多补算 EMBED_PER_TURN 条（从新到旧），长会话分几轮补全，不会卡住生成。

db.exec(`CREATE TABLE IF NOT EXISTS message_vectors (
  message_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  hash TEXT NOT NULL,
  vec BLOB NOT NULL,
  created_at INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_message_vectors_chat ON message_vectors(chat_id)');

const EMBED_PER_TURN = 128;
const BATCH = 32;
const MAX_CHARS = 2000;

export type EmbedConfig = { baseUrl: string; apiKey: string; model: string };
export type RagChunk = { index: number; role: string; text: string; score: number };
export type RetrieveResult = { chunks: RagChunk[]; source: 'vector' | 'keyword'; pending: number; error?: string };

export function embedConfig(): EmbedConfig | null {
  const baseUrl = getSetting('embed.baseUrl').trim().replace(/\/+$/, '');
  const apiKey = getSetting('embed.apiKey').trim();
  const model = getSetting('embed.model').trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl, apiKey, model };
}

export function embedStatus() {
  return {
    baseUrl: getSetting('embed.baseUrl'),
    model: getSetting('embed.model'),
    hasKey: hasSetting('embed.apiKey'),
    ready: Boolean(embedConfig()),
    stored: (db.prepare('SELECT COUNT(*) AS n FROM message_vectors').get() as { n: number }).n,
  };
}

export async function embedTexts(texts: string[], config: EmbedConfig): Promise<number[][]> {
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH) {
    const input = texts.slice(start, start + BATCH).map((text) => text.slice(0, MAX_CHARS) || ' ');
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}/embeddings`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: config.model, input }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new Error(`无法连接向量接口：${error instanceof Error ? error.message : String(error)}`);
    }
    const raw = await response.text();
    if (!response.ok) throw new Error(`向量接口返回 ${response.status}${raw ? `：${raw.slice(0, 160)}` : ''}`);
    let payload: { data?: { embedding?: unknown; index?: number }[] };
    try { payload = JSON.parse(raw); } catch { throw new Error('向量接口返回的不是 JSON'); }
    const data = Array.isArray(payload.data) ? [...payload.data] : [];
    if (data.length !== input.length) throw new Error(`向量接口返回了 ${data.length} 条，期望 ${input.length} 条`);
    data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const item of data) {
      const vec = Array.isArray(item.embedding) ? item.embedding.map(Number) : [];
      if (!vec.length || vec.some((value) => !Number.isFinite(value))) throw new Error('向量接口返回的 embedding 无效');
      out.push(vec);
    }
  }
  return out;
}

function hashOf(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
}

function toBlob(vec: number[]): Buffer {
  return Buffer.from(new Float32Array(vec).buffer);
}

function fromBlob(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer);
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; na += a[index] * a[index]; nb += b[index] * b[index]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** 消息里真正要向量化的文本：去掉 <think>、HTML 标签和多余空白 */
function vectorText(message: DbMessage): string {
  return String(message.content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryText(history: DbMessage[], queryMessages: number, fallback: string): string {
  const tail = history.filter((message) => message.role !== 'system' && message.hidden !== 1).slice(-Math.max(1, queryMessages));
  const text = tail.map(vectorText).filter(Boolean).join('\n');
  return text || fallback;
}

type StoredRow = { message_id: number; model: string; hash: string; vec: Uint8Array };

/**
 * 检索更早的相关楼层。向量接口不可用或出错时退回关键词检索（不影响生成）。
 */
export async function retrieveMemories(chatId: number, history: DbMessage[], fallbackQuery: string, prefs: RagPrefs): Promise<RetrieveResult> {
  const query = queryText(history, prefs.queryMessages, fallbackQuery);
  const keyword = (error?: string): RetrieveResult => ({ chunks: query ? ragChunks(history, query, prefs.topK) : [], source: 'keyword', pending: 0, error });
  if (!prefs.enabled || !query) return { chunks: [], source: 'keyword', pending: 0 };
  const config = embedConfig();
  if (!config) return keyword();

  const cutoff = history.length - RECENT_WINDOW;
  const candidates = history
    .map((message, index) => ({ message, index, text: vectorText(message) }))
    .filter((item) => item.index < cutoff && item.message.role !== 'system' && item.message.hidden !== 1 && item.text);
  if (!candidates.length) return { chunks: [], source: 'vector', pending: 0 };

  try {
    const stored = new Map<number, StoredRow>();
    const rows = db.prepare('SELECT message_id, model, hash, vec FROM message_vectors WHERE chat_id = ?').all(chatId) as StoredRow[];
    for (const row of rows) stored.set(row.message_id, row);

    const missing = candidates.filter((item) => {
      const row = stored.get(item.message.id);
      return !row || row.model !== config.model || row.hash !== hashOf(item.text);
    });
    const batch = missing.slice(-EMBED_PER_TURN);
    const [queryVec, ...vecs] = await embedTexts([query, ...batch.map((item) => item.text)], config);
    if (batch.length) {
      const upsert = db.prepare('INSERT OR REPLACE INTO message_vectors (message_id, chat_id, model, hash, vec, created_at) VALUES (?, ?, ?, ?, ?, ?)');
      const now = Date.now();
      db.exec('BEGIN');
      try {
        batch.forEach((item, at) => {
          const blob = toBlob(vecs[at]);
          upsert.run(item.message.id, chatId, config.model, hashOf(item.text), blob, now);
          stored.set(item.message.id, { message_id: item.message.id, model: config.model, hash: hashOf(item.text), vec: blob });
        });
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }

    const scored: RagChunk[] = [];
    for (const item of candidates) {
      const row = stored.get(item.message.id);
      if (!row || row.model !== config.model || row.hash !== hashOf(item.text)) continue;
      const score = cosine(queryVec, fromBlob(row.vec));
      if (score >= prefs.threshold) scored.push({ index: item.index, role: item.message.role, text: item.message.content, score });
    }
    // 内容重复的楼层只留一条（相似度最高的那条）
    const seen = new Set<string>();
    const chunks = scored
      .sort((a, b) => b.score - a.score)
      .filter((chunk) => { const key = chunk.text.replace(/\s+/g, ''); if (seen.has(key)) return false; seen.add(key); return true; })
      .slice(0, prefs.topK)
      .sort((a, b) => a.index - b.index);
    return { chunks, source: 'vector', pending: missing.length - batch.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[vectors] 向量检索失败，改用关键词检索：', message);
    return keyword(message);
  }
}

/** 清掉一个会话的向量缓存（ST 的「Purge vectors」） */
export function purgeChatVectors(chatId: number): number {
  return Number(db.prepare('DELETE FROM message_vectors WHERE chat_id = ?').run(chatId).changes);
}

export function chatVectorCount(chatId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM message_vectors WHERE chat_id = ?').get(chatId) as { n: number }).n;
}
