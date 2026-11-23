import db, { finishGeneration, getCharacterById, startGeneration } from '@/lib/db';
import { modelConfigured, modelName, streamChat, type ChatMessage } from '@/lib/model';
import { applyRegex } from '@/lib/regex-apply';
import { stripMvuBlocks } from '@/lib/mvu';
import { loadRoomConfig } from '@/lib/resources-db';
import { pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';
import { estimateTokens } from '@/lib/usage';
import {
  authorNote,
  summaryPrefs,
  summaryState,
  type AuthorNote,
  type Role,
  type SummaryPosition,
  type SummaryPrefs,
  type SummaryState,
} from '@/lib/memory';

// 群聊的作者注释与记忆摘要（ST：群聊同样有 Author's Note 和 Summarize，按聊天保存）。
// 存在 rooms.author_note / summary / summary_prefs，格式与单聊完全一样，解析复用 lib/memory.ts。
// 摘要只做模型模式（群聊没有旧数据要兼容）：回复落库后后台跑，新消息数 ≥ 间隔才跑，按房间模型计费。

type RoomMemoryRow = { id: number; user_id: number; model: string | null; character_ids: string; author_note: string | null; summary: string | null; summary_prefs: string | null; persona_id?: number | null };
type RoomMsgRow = { id: number; role: string; speaker_id: string | null; content: string; persona_name?: string | null };

const MAX_CHARS = 24_000;
const PER_MESSAGE = 2_000;
const running = new Set<number>();

function row(roomId: number, userId: number): RoomMemoryRow | undefined {
  return db.prepare('SELECT id, user_id, model, character_ids, author_note, summary, summary_prefs, persona_id, chat_lorebook_id FROM rooms WHERE id = ? AND user_id = ?').get(roomId, userId) as RoomMemoryRow | undefined;
}

function roomPrefs(source: RoomMemoryRow): SummaryPrefs {
  // 群聊一律模型摘要（单聊里「旧会话沿用抽取式」的兼容判断这里不需要）
  return { ...summaryPrefs(source), mode: 'llm' };
}

function allMessages(roomId: number): RoomMsgRow[] {
  return db.prepare(`SELECT id, role, speaker_id, content, persona_name FROM room_messages WHERE room_id = ? AND (attachment IS NULL OR attachment NOT LIKE '%"kind":"image"%') ORDER BY id`).all(roomId) as RoomMsgRow[];
}

export type RoomPromptMemory = {
  summary: string;
  summaryPlacement: { position: SummaryPosition; depth: number; role: Role; template: string };
  authorNote: AuthorNote;
};

export function roomPromptMemory(roomId: number, userId: number): RoomPromptMemory | null {
  const source = row(roomId, userId);
  if (!source) return null;
  const prefs = roomPrefs(source);
  const state = summaryState(source);
  return {
    summary: prefs.enabled ? state.text : '',
    summaryPlacement: { position: prefs.position, depth: prefs.depth, role: prefs.role, template: prefs.template },
    authorNote: authorNote(source),
  };
}

export type RoomMemorySettings = { note: AuthorNote; prefs: SummaryPrefs; summary: SummaryState; behind: number; running: boolean };

export function roomMemorySettings(roomId: number, userId: number): RoomMemorySettings | null {
  const source = row(roomId, userId);
  if (!source) return null;
  const summary = summaryState(source);
  const count = (db.prepare('SELECT COUNT(*) AS n FROM room_messages WHERE room_id = ?').get(roomId) as { n: number }).n;
  return { note: authorNote(source), prefs: roomPrefs(source), summary, behind: Math.max(0, count - Math.min(summary.covered, count)), running: running.has(roomId) };
}

export type RoomMemoryPatch = { note?: Partial<AuthorNote>; prefs?: Partial<SummaryPrefs>; summaryText?: string };

export function updateRoomMemory(roomId: number, userId: number, patch: RoomMemoryPatch): boolean {
  const source = row(roomId, userId);
  if (!source) return false;
  if (patch.note) {
    const next = authorNote({ author_note: JSON.stringify({ ...authorNote(source), ...patch.note }) });
    db.prepare('UPDATE rooms SET author_note = ? WHERE id = ?').run(JSON.stringify(next), roomId);
  }
  if (patch.prefs) {
    const merged = { ...roomPrefs(source), ...patch.prefs, mode: 'llm' };
    const next = summaryPrefs({ summary_prefs: JSON.stringify(merged) });
    db.prepare('UPDATE rooms SET summary_prefs = ? WHERE id = ?').run(JSON.stringify(next), roomId);
  }
  if (typeof patch.summaryText === 'string') {
    const state = summaryState(source);
    const count = (db.prepare('SELECT COUNT(*) AS n FROM room_messages WHERE room_id = ?').get(roomId) as { n: number }).n;
    // 手改摘要：视为覆盖到当前（同单聊，之后自动摘要在它基础上继续）
    const next: SummaryState = { text: patch.summaryText.slice(0, 20000), covered: patch.summaryText.trim() ? Math.max(state.covered, count) : 0, source: 'manual', updatedAt: Date.now() };
    saveRoomSummary(roomId, next);
  }
  return true;
}

function saveRoomSummary(roomId: number, state: SummaryState): void {
  db.prepare('UPDATE rooms SET summary = ? WHERE id = ?').run(JSON.stringify(state), roomId);
}

function clean(text: string): string {
  return stripMvuBlocks(text)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function summarizeOnce(roomId: number, userId: number, upTo: number): Promise<{ state: SummaryState; ran: boolean; error?: string }> {
  const source = row(roomId, userId)!;
  const prefs = roomPrefs(source);
  const state = summaryState(source);
  const messages = allMessages(roomId);
  const config = loadRoomConfig(userId, { personaId: source.persona_id ?? null, chatLorebookId: (source as { chat_lorebook_id?: number | null }).chat_lorebook_id ?? null, characterIds: JSON.parse(source.character_ids || '[]') as string[] });
  const userName = config.userName;
  const nameOf = (id: string | null) => (id ? getCharacterById(id)?.name ?? '角色' : '角色');
  const memberNames = (JSON.parse(source.character_ids || '[]') as string[]).map((id) => nameOf(id));
  const start = Math.min(state.covered, upTo);
  const lines: string[] = [];
  let used = 0;
  let reached = start;
  for (let index = start; index < upTo; index += 1) {
    const message = messages[index];
    reached = index + 1;
    if (!message) continue;
    const who = message.role === 'user' ? message.persona_name || userName : nameOf(message.speaker_id);
    const depth = messages.length - 1 - index;
    const sent = applyRegex(config.regexRules, message.content, { target: message.role === 'user' ? 'user' : 'assistant', purpose: 'send', depth });
    let body = clean(sent).replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, who);
    if (!body) continue;
    if (body.length > PER_MESSAGE) body = `${body.slice(0, PER_MESSAGE)}…`;
    const line = `${who}：${body}`;
    if (lines.length && used + line.length > MAX_CHARS) {
      reached = index;
      break;
    }
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) {
    if (reached !== state.covered) {
      const next = { ...state, covered: reached };
      saveRoomSummary(roomId, next);
      return { state: next, ran: false };
    }
    return { state, ran: false };
  }

  const charLabel = memberNames.join('、') || '角色们';
  const instruction = prefs.prompt.replace(/\{\{words\}\}/gi, String(prefs.words)).replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, charLabel);
  const prompt: ChatMessage[] = [
    { role: 'system', content: `你在为一段多角色群像扮演（${charLabel} 与 ${userName}）写长期记忆摘要。` },
    {
      role: 'user',
      content: [state.text.trim() ? `【已有摘要】\n${state.text.trim()}` : '', `【新的对话】\n${lines.join('\n\n')}`].filter(Boolean).join('\n\n'),
    },
    { role: 'system', content: instruction },
  ];
  const model = modelName(source.model);
  const promptTokens = prompt.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0);
  const maxTokens = Math.min(2000, Math.max(300, prefs.words * 2));
  const maxCost = pointsCost(promptTokens, maxTokens, model);
  const reservation = reservePoints(userId, Math.max(0, maxCost - dailyFreeRemaining(userId)), `群聊记忆摘要 · ${model}`, `room-memory:${roomId}`);
  if (!reservation.ok) {
    const next = { ...state, error: '点数不足，摘要没有更新' };
    saveRoomSummary(roomId, next);
    return { state: next, ran: false, error: next.error };
  }
  const generationId = startGeneration(userId, null, 'summary', model);
  let full = '';
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  let billed = model;
  try {
    for await (const event of streamChat(prompt, {
      model: source.model,
      params: { ...config.preset.params, maxTokens, temperature: 0.3, topP: 1, topK: 0, minP: 0, typicalP: 1, repetitionPenalty: 1, presencePenalty: 0, frequencyPenalty: 0, seed: -1 },
    })) {
      if (event.type === 'content') full += event.text;
      else if (event.type === 'usage') usage = event;
      else if (event.type === 'route') billed = event.model;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGeneration(generationId, { model: billed, status: 'error', promptTokens, completionTokens: estimateTokens(full), estimated: true, error: message });
    settleGeneration(userId, reservation.reserved, 0, `room-memory:${roomId}`);
    const next = { ...state, error: `摘要生成失败：${message.slice(0, 200)}` };
    saveRoomSummary(roomId, next);
    return { state: next, ran: false, error: next.error };
  }
  const completionTokens = usage?.completionTokens ?? estimateTokens(full);
  finishGeneration(generationId, { model: billed, status: 'done', promptTokens: usage?.promptTokens ?? promptTokens, completionTokens, totalTokens: usage?.totalTokens, estimated: !usage });
  settleGeneration(userId, reservation.reserved, pointsCost(usage?.promptTokens ?? promptTokens, completionTokens, billed), `room-memory:${roomId}`);
  const text = full.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) {
    const next = { ...state, error: '模型没有返回摘要内容' };
    saveRoomSummary(roomId, next);
    return { state: next, ran: false, error: next.error };
  }
  const next: SummaryState = { text, covered: reached, source: 'auto', updatedAt: Date.now() };
  saveRoomSummary(roomId, next);
  return { state: next, ran: true };
}

/** 回复落库后调用（不 await）：新消息数到了间隔才跑；最新一轮先不收，免得换版后摘要过时 */
export async function autoRoomSummarize(roomId: number, userId: number): Promise<void> {
  if (running.has(roomId) || !modelConfigured()) return;
  const source = row(roomId, userId);
  if (!source) return;
  const prefs = roomPrefs(source);
  if (!prefs.enabled) return;
  const count = allMessages(roomId).length;
  const state = summaryState(source);
  if (state.covered > count) saveRoomSummary(roomId, { ...state, covered: 0 });
  const upTo = Math.max(0, count - 2);
  if (upTo - Math.min(state.covered, count) < prefs.interval) return;
  running.add(roomId);
  try {
    await summarizeOnce(roomId, userId, upTo);
  } catch (error) {
    console.warn('[room-memory] 自动摘要失败', error);
  } finally {
    running.delete(roomId);
  }
}

/** 「立即刷新」：连续跑几段追到最新 */
export async function roomSummarizeNow(roomId: number, userId: number): Promise<{ state: SummaryState; error?: string }> {
  const source = row(roomId, userId);
  if (!source) return { state: { text: '', covered: 0, source: 'auto', updatedAt: 0 }, error: '房间不存在' };
  if (running.has(roomId)) return { state: summaryState(source), error: '摘要正在生成，请稍候' };
  if (!modelConfigured()) return { state: summaryState(source), error: '模型未配置' };
  running.add(roomId);
  try {
    const count = allMessages(roomId).length;
    const current = summaryState(source);
    if (current.covered > count) saveRoomSummary(roomId, { ...current, covered: 0 });
    let result = { state: summaryState(row(roomId, userId)!), ran: false } as { state: SummaryState; ran: boolean; error?: string };
    for (let round = 0; round < 6; round += 1) {
      result = await summarizeOnce(roomId, userId, count);
      if (result.error || !result.ran || result.state.covered >= count) break;
    }
    return { state: result.state, error: result.error };
  } finally {
    running.delete(roomId);
  }
}
