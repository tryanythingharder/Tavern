import db, { finishGeneration, getCharacterById, listMessages, startGeneration, type DbChat, type DbMessage } from '@/lib/db';
import { modelConfigured, modelName, streamChat, type ChatMessage } from '@/lib/model';
import { applyRegex } from '@/lib/regex-apply';
import { stripMvuBlocks } from '@/lib/mvu';
import { loadGenerationConfig } from '@/lib/resources-db';
import { pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';
import { estimateTokens } from '@/lib/usage';
import { generateSummaryText, RECENT_WINDOW, saveSummaryState, summaryPrefs, summaryState, type SummaryState } from '@/lib/memory';

// 模型摘要（对齐 ST Summarize 扩展的「主 API」模式，做成增量）：
//   已有摘要 + 上次覆盖到之后的新对话 → 用会话当前模型生成新摘要，覆盖到最新。
//   新对话太长时一次只吃一段（MAX_CHARS），covered 停在那里，下次接着来，强制刷新时连续跑几轮追上。
//   自动：回复落库后后台跑（不挡回复），新增消息数 ≥ 间隔才跑；最新一轮（玩家+回复）先不收，免得重新生成后摘要过时。
//   计费：按会话模型价格扣点数，账本备注「记忆摘要」。

const MAX_CHARS = 24_000;
const PER_MESSAGE = 2_000;
const running = new Set<number>();

function cleanForSummary(text: string): string {
  return stripMvuBlocks(text)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type RunResult = { state: SummaryState; ran: boolean; error?: string };

async function summarizeOnce(chat: DbChat, userId: number, messages: DbMessage[], upTo: number): Promise<RunResult> {
  const prefs = summaryPrefs(chat);
  const state = summaryState(chat);
  const character = getCharacterById(chat.character_id);
  const config = loadGenerationConfig(userId, chat);
  const userName = config.userName;
  const charName = character?.name ?? '角色';
  const start = Math.min(state.covered, upTo);
  const lines: string[] = [];
  let used = 0;
  let reached = start;
  for (let index = start; index < upTo; index += 1) {
    const message = messages[index];
    reached = index + 1;
    if (!message || message.role === 'system') continue;
    const depth = messages.length - 1 - index;
    const sent = applyRegex(config.regexRules, message.content, { target: message.role === 'user' ? 'user' : 'assistant', purpose: 'send', depth });
    let body = cleanForSummary(sent).replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, charName);
    if (!body) continue;
    if (body.length > PER_MESSAGE) body = `${body.slice(0, PER_MESSAGE)}…`;
    const line = `${message.role === 'user' ? message.persona_name || userName : charName}：${body}`;
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
      saveSummaryState(chat.id, next);
      return { state: next, ran: false };
    }
    return { state, ran: false };
  }

  const instruction = prefs.prompt.replace(/\{\{words\}\}/gi, String(prefs.words)).replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, charName);
  const prompt: ChatMessage[] = [
    { role: 'system', content: `你在为一段角色扮演对话（${charName} 与 ${userName}）写长期记忆摘要。` },
    {
      role: 'user',
      content: [
        state.text.trim() ? `【已有摘要】\n${state.text.trim()}` : '',
        `【新的对话】\n${lines.join('\n\n')}`,
      ].filter(Boolean).join('\n\n'),
    },
    { role: 'system', content: instruction },
  ];
  const model = modelName(chat.model);
  const promptTokens = prompt.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0);
  const maxTokens = Math.min(2000, Math.max(300, prefs.words * 2));
  const maxCost = pointsCost(promptTokens, maxTokens, model);
  const reservation = reservePoints(userId, Math.max(0, maxCost - dailyFreeRemaining(userId)), `记忆摘要 · ${model}`, `memory:${chat.id}`);
  if (!reservation.ok) {
    const next = { ...state, error: '点数不足，摘要没有更新' };
    saveSummaryState(chat.id, next);
    return { state: next, ran: false, error: next.error };
  }
  const generationId = startGeneration(userId, chat.id, 'summary', model);
  let full = '';
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  let billed = model;
  try {
    for await (const event of streamChat(prompt, {
      model: chat.model,
      params: { ...config.preset.params, maxTokens, temperature: 0.3, topP: 1, topK: 0, minP: 0, typicalP: 1, repetitionPenalty: 1, presencePenalty: 0, frequencyPenalty: 0, seed: -1 },
    })) {
      if (event.type === 'content') full += event.text;
      else if (event.type === 'usage') usage = event;
      else if (event.type === 'route') billed = event.model;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGeneration(generationId, { model: billed, status: 'error', promptTokens, completionTokens: estimateTokens(full), estimated: true, error: message });
    settleGeneration(userId, reservation.reserved, 0, `memory:${chat.id}`);
    const next = { ...state, error: `摘要生成失败：${message.slice(0, 200)}` };
    saveSummaryState(chat.id, next);
    return { state: next, ran: false, error: next.error };
  }
  const completionTokens = usage?.completionTokens ?? estimateTokens(full);
  finishGeneration(generationId, { model: billed, status: 'done', promptTokens: usage?.promptTokens ?? promptTokens, completionTokens, totalTokens: usage?.totalTokens, estimated: !usage });
  settleGeneration(userId, reservation.reserved, pointsCost(usage?.promptTokens ?? promptTokens, completionTokens, billed), `memory:${chat.id}`);
  // 思考模型可能把 <think> 写进正文
  const text = full.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) {
    const next = { ...state, error: '模型没有返回摘要内容' };
    saveSummaryState(chat.id, next);
    return { state: next, ran: false, error: next.error };
  }
  const next: SummaryState = { text, covered: reached, source: 'auto', updatedAt: Date.now() };
  saveSummaryState(chat.id, next);
  return { state: next, ran: true };
}

function loadChat(chatId: number, userId: number): DbChat | undefined {
  return db.prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId) as DbChat | undefined;
}

/**
 * 立即刷新（「刷新摘要」按钮）：模型模式下连续跑几段追到最新；抽取式直接重算。
 * 返回最新状态和错误（有的话）。
 */
export async function summarizeNow(chatId: number, userId: number): Promise<{ state: SummaryState; error?: string }> {
  const chat = loadChat(chatId, userId);
  if (!chat) return { state: { text: '', covered: 0, source: 'auto', updatedAt: 0 } };
  const prefs = summaryPrefs(chat);
  const messages = listMessages(chatId);
  if (prefs.mode === 'extract' || !modelConfigured()) {
    const character = getCharacterById(chat.character_id);
    const upTo = Math.max(0, messages.length - RECENT_WINDOW);
    const state: SummaryState = { text: generateSummaryText(character?.name ?? '角色', messages, upTo), covered: upTo, source: 'auto', updatedAt: Date.now() };
    saveSummaryState(chatId, state);
    return { state, error: prefs.mode === 'llm' ? '模型未配置，已改用抽取式' : undefined };
  }
  if (running.has(chatId)) return { state: summaryState(chat), error: '摘要正在生成，请稍等' };
  running.add(chatId);
  try {
    // 手动刷新：从头重写一遍（ST 的「立即摘要」也是整段重来）
    const backup = summaryState(chat);
    saveSummaryState(chatId, { text: '', covered: 0, source: 'auto', updatedAt: Date.now() });
    let result: RunResult = { state: summaryState(loadChat(chatId, userId)!), ran: false };
    for (let round = 0; round < 8; round += 1) {
      const current = loadChat(chatId, userId);
      if (!current) break;
      if (summaryState(current).covered >= messages.length) break;
      result = await summarizeOnce(current, userId, messages, messages.length);
      if (!result.ran) break;
    }
    // 第一段就失败：把原来的摘要放回去，只留下错误提示
    if (result.error && !result.state.text.trim()) {
      const restored = { ...backup, error: result.error };
      saveSummaryState(chatId, restored);
      return { state: restored, error: result.error };
    }
    return { state: result.state, error: result.error };
  } finally {
    running.delete(chatId);
  }
}

/** 回复落库后调用（不 await）：到了间隔才跑一段模型摘要 */
export async function autoSummarize(chatId: number, userId: number): Promise<void> {
  if (running.has(chatId) || !modelConfigured()) return;
  const chat = loadChat(chatId, userId);
  if (!chat) return;
  const prefs = summaryPrefs(chat);
  if (!prefs.enabled || prefs.mode !== 'llm') return;
  const messages = listMessages(chatId);
  const state = summaryState(chat);
  // 删了楼层后 covered 可能比现在的总数还大：重新从头摘
  if (state.covered > messages.length) saveSummaryState(chatId, { ...state, covered: 0 });
  const upTo = Math.max(0, messages.length - 2);
  if (upTo - Math.min(state.covered, messages.length) < prefs.interval) return;
  running.add(chatId);
  try {
    await summarizeOnce(loadChat(chatId, userId)!, userId, messages, upTo);
  } catch (error) {
    console.warn('[memory] 自动摘要失败', error);
  } finally {
    running.delete(chatId);
  }
}

export function summarizing(chatId: number): boolean {
  return running.has(chatId);
}
