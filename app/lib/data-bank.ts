import db from '@/lib/db';
import { getGenPrefs, type DataBankPrefs } from '@/lib/gen-prefs';
import { ragBigrams } from '@/lib/memory';
import { cosine, embedConfig, embedTexts, fromBlob, hashOf, queryText, toBlob, type TextMessage } from '@/lib/vectors';

// 资料库（ST Data Bank + Vector Storage 的文件部分）：玩家上传的文本资料，分三档作用范围——
//   global（所有聊天）/ character（这个角色的所有聊天）/ chat（只这段聊天；群聊用 room）。
// 生成时：小于 sizeThresholdKb 的整篇放进去；大的按 chunkSize 切块，用最近几条消息做查询取最相关的 chunkCount 块。
// 块向量按「块正文哈希 + 模型」缓存在 lore_vectors（和世界书共用），没配向量接口时退回字符 bigram 关键词检索。

db.exec(`CREATE TABLE IF NOT EXISTS data_bank_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
)`);
db.exec('CREATE INDEX IF NOT EXISTS idx_data_bank_user ON data_bank_files(user_id, scope, scope_id)');

export type DataBankScope = 'global' | 'character' | 'chat' | 'room';
export const DATA_BANK_SCOPES: DataBankScope[] = ['global', 'character', 'chat', 'room'];
export const MAX_FILE_CHARS = 2_000_000;
export const MAX_FILES = 200;

type Row = { id: number; user_id: number; scope: string; scope_id: string; name: string; content: string; enabled: number; created_at: number };
export type DataBankFile = { id: number; scope: DataBankScope; scopeId: string; name: string; size: number; enabled: boolean; createdAt: number; preview: string };

function view(row: Row): DataBankFile {
  return {
    id: row.id, scope: row.scope as DataBankScope, scopeId: row.scope_id, name: row.name,
    size: Buffer.byteLength(row.content, 'utf8'), enabled: row.enabled === 1, createdAt: row.created_at,
    preview: row.content.slice(0, 160),
  };
}

export function listDataBank(userId: number, filter?: { scope: DataBankScope; scopeId: string }[]): DataBankFile[] {
  const rows = db.prepare('SELECT * FROM data_bank_files WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Row[];
  const keep = filter ? rows.filter((row) => filter.some((item) => item.scope === row.scope && item.scopeId === row.scope_id)) : rows;
  return keep.map(view);
}

export function getDataBankFile(userId: number, id: number): (DataBankFile & { content: string }) | null {
  const row = db.prepare('SELECT * FROM data_bank_files WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  return row ? { ...view(row), content: row.content } : null;
}

export function addDataBankFile(userId: number, input: { scope: DataBankScope; scopeId: string; name: string; content: string }): DataBankFile | { error: string } {
  const content = input.content.replace(/\r\n?/g, '\n').replace(/\u0000/g, '');
  if (!content.trim()) return { error: '文件里没有文字' };
  if (content.length > MAX_FILE_CHARS) return { error: '文件太大（超过 200 万字）' };
  const count = (db.prepare('SELECT COUNT(*) AS n FROM data_bank_files WHERE user_id = ?').get(userId) as { n: number }).n;
  if (count >= MAX_FILES) return { error: `资料最多 ${MAX_FILES} 份，先删掉一些` };
  const name = input.name.trim().slice(0, 120) || '未命名资料';
  const result = db.prepare('INSERT INTO data_bank_files (user_id, scope, scope_id, name, content, enabled, created_at) VALUES (?,?,?,?,?,1,?)')
    .run(userId, input.scope, input.scope === 'global' ? '' : input.scopeId, name, content, Date.now());
  return view(db.prepare('SELECT * FROM data_bank_files WHERE id = ?').get(Number(result.lastInsertRowid)) as Row);
}

export function updateDataBankFile(userId: number, id: number, patch: { name?: string; enabled?: boolean; content?: string; scope?: DataBankScope; scopeId?: string }): DataBankFile | null {
  const row = db.prepare('SELECT * FROM data_bank_files WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
  if (!row) return null;
  const scope = patch.scope ?? (row.scope as DataBankScope);
  const next = {
    name: patch.name !== undefined ? patch.name.trim().slice(0, 120) || row.name : row.name,
    enabled: patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : row.enabled,
    content: patch.content !== undefined && patch.content.trim() ? patch.content.replace(/\r\n?/g, '\n').slice(0, MAX_FILE_CHARS) : row.content,
    scope,
    scopeId: scope === 'global' ? '' : patch.scopeId ?? row.scope_id,
  };
  db.prepare('UPDATE data_bank_files SET name = ?, enabled = ?, content = ?, scope = ?, scope_id = ? WHERE id = ?').run(next.name, next.enabled, next.content, next.scope, next.scopeId, id);
  return view(db.prepare('SELECT * FROM data_bank_files WHERE id = ?').get(id) as Row);
}

export function deleteDataBankFile(userId: number, id: number): boolean {
  return db.prepare('DELETE FROM data_bank_files WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/** ST 的切块：按段落→句子→硬切，块之间可重叠 overlap%（ST chunk_overlap_percent_db） */
export function chunkText(text: string, size: number, overlapPct = 0): string[] {
  const clean = text.replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const pieces: string[] = [];
  for (const para of clean.split(/\n\s*\n/)) {
    if (para.length <= size) { pieces.push(para); continue; }
    const sentences = para.match(/[^。！？!?.\n]+[。！？!?.]*\n?|\n/g) ?? [para];
    let buf = '';
    for (const sentence of sentences) {
      if (sentence.length > size) {
        if (buf) { pieces.push(buf); buf = ''; }
        for (let at = 0; at < sentence.length; at += size) pieces.push(sentence.slice(at, at + size));
      } else if (buf.length + sentence.length > size) { pieces.push(buf); buf = sentence; }
      else buf += sentence;
    }
    if (buf) pieces.push(buf);
  }
  // 小段合并到 size 以内
  const chunks: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (!cur) cur = piece;
    else if (cur.length + 2 + piece.length <= size) cur += '\n\n' + piece;
    else { chunks.push(cur); cur = piece; }
  }
  if (cur) chunks.push(cur);
  const overlap = Math.floor(size * Math.min(50, Math.max(0, overlapPct)) / 100);
  if (!overlap) return chunks.map((item) => item.trim()).filter(Boolean);
  return chunks.map((item, at) => (at > 0 ? chunks[at - 1].slice(-overlap) + item : item).trim()).filter(Boolean);
}

export type DataBankScopeKey = { characterId?: string | null; chatId?: number | null; roomId?: number | null };

function scopesFor(key: DataBankScopeKey): { scope: DataBankScope; scopeId: string }[] {
  const out: { scope: DataBankScope; scopeId: string }[] = [{ scope: 'global', scopeId: '' }];
  if (key.characterId) out.push({ scope: 'character', scopeId: key.characterId });
  if (key.chatId) out.push({ scope: 'chat', scopeId: String(key.chatId) });
  if (key.roomId) out.push({ scope: 'room', scopeId: String(key.roomId) });
  return out;
}

const EMBED_PER_TURN = 256;

export type DataBankResult = { text: string; files: number; chunks: number; source: 'none' | 'whole' | 'vector' | 'keyword' };

/**
 * 生成时要放进提示词的资料文本（已套模板）；没有资料、没开时返回空串。
 * characterIds：群聊传全部成员。
 */
export async function dataBankText(userId: number, key: DataBankScopeKey & { characterIds?: string[] }, history: TextMessage[], prefsOverride?: DataBankPrefs): Promise<DataBankResult> {
  const prefs = prefsOverride ?? getGenPrefs(userId).dataBank;
  const empty: DataBankResult = { text: '', files: 0, chunks: 0, source: 'none' };
  if (!prefs.enabled) return empty;
  const scopes = [...scopesFor(key), ...(key.characterIds ?? []).map((id) => ({ scope: 'character' as const, scopeId: id }))];
  const rows = (db.prepare('SELECT * FROM data_bank_files WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC').all(userId) as Row[])
    .filter((row) => scopes.some((item) => item.scope === row.scope && item.scopeId === row.scope_id));
  if (!rows.length) return empty;
  const limit = prefs.sizeThresholdKb * 1024;
  const whole = rows.filter((row) => Buffer.byteLength(row.content, 'utf8') <= limit);
  const large = rows.filter((row) => Buffer.byteLength(row.content, 'utf8') > limit);
  const parts: string[] = whole.map((row) => row.content.trim());
  let source: DataBankResult['source'] = whole.length ? 'whole' : 'none';
  let picked: string[] = [];
  if (large.length) {
    const chunks = large.flatMap((row) => chunkText(row.content, prefs.chunkSize, prefs.chunkOverlap));
    const query = queryText(history, 2, '');
    if (query && chunks.length) {
      const config = embedConfig();
      let done = false;
      if (config) {
        try {
          const hashes = chunks.map((chunk) => hashOf(chunk));
          const stored = new Map<string, Uint8Array>();
          const select = db.prepare('SELECT vec FROM lore_vectors WHERE hash = ? AND model = ?');
          for (const hash of new Set(hashes)) {
            const row = select.get(hash, config.model) as { vec: Uint8Array } | undefined;
            if (row) stored.set(hash, row.vec);
          }
          const missing = [...new Map(chunks.map((chunk, at) => [hashes[at], chunk])).entries()].filter(([hash]) => !stored.has(hash)).slice(0, EMBED_PER_TURN);
          const [queryVec, ...vecs] = await embedTexts([query, ...missing.map(([, text]) => text)], config);
          if (missing.length) {
            const upsert = db.prepare('INSERT OR REPLACE INTO lore_vectors (hash, model, vec, created_at) VALUES (?, ?, ?, ?)');
            const now = Date.now();
            db.exec('BEGIN');
            try {
              missing.forEach(([hash], at) => { const blob = toBlob(vecs[at]); upsert.run(hash, config.model, blob, now); stored.set(hash, blob); });
              db.exec('COMMIT');
            } catch (error) { db.exec('ROLLBACK'); throw error; }
          }
          picked = chunks
            .map((chunk, at) => ({ chunk, at, vec: stored.get(hashes[at]) }))
            .filter((item): item is { chunk: string; at: number; vec: Uint8Array } => Boolean(item.vec))
            .map((item) => ({ ...item, score: cosine(queryVec, fromBlob(item.vec)) }))
            .filter((item) => item.score >= prefs.threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, prefs.chunkCount)
            .sort((a, b) => a.at - b.at)
            .map((item) => item.chunk);
          source = 'vector';
          done = true;
        } catch (error) {
          console.warn('[data-bank] 向量检索失败，改用关键词：', error instanceof Error ? error.message : String(error));
        }
      }
      if (!done) {
        const grams = ragBigrams(query);
        picked = chunks
          .map((chunk, at) => {
            const content = chunk.toLowerCase().replace(/\s+/g, '');
            let hits = 0;
            for (const gram of grams) if (content.includes(gram)) hits += 1;
            return { chunk, at, hits, score: hits / Math.sqrt(Math.max(grams.size, 1) * Math.max(content.length, 1)) };
          })
          .filter((item) => item.hits >= 2)
          .sort((a, b) => b.score - a.score)
          .slice(0, prefs.chunkCount)
          .sort((a, b) => a.at - b.at)
          .map((item) => item.chunk);
        source = 'keyword';
      }
    }
  }
  const body = [...parts, ...picked].filter(Boolean).join('\n\n');
  if (!body) return { ...empty, source };
  const template = prefs.template.includes('{{text}}') ? prefs.template : `${prefs.template}\n{{text}}`;
  return { text: template.split('{{text}}').join(body), files: rows.length, chunks: picked.length, source };
}
