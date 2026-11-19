import { templateLore, templatePrompt } from '@/lib/ejs-server';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { finishGeneration, getChat, getCharacterById, listMessages, startGeneration } from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { chatVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig } from '@/lib/resources-db';
import { memorySettings } from '@/lib/memory';
import { getOverride } from '@/lib/cards';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/chats/[id]/impersonate { hint? }
// ST 的「代写」（Impersonate）：让模型以玩家人设写下一句，只流式回到输入框，不落库。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const chatId = Number((await context.params).id);
  const chat = getChat(chatId, user.id);
  if (!chat) return fail('会话不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { hint?: string };
  const hint = String(body.hint ?? '').trim().slice(0, 300);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置', 500);
  const character = getCharacterById(chat.character_id);
  if (!character) return fail('角色不存在', 404);

  const config = loadGenerationConfig(user.id, chat);
  const memory = memorySettings(chat);
  const ejsHistory = listMessages(chatId);
  const vars = chatVariables(chat.id, chat.character_id);
  const ejsLore = await templateLore(config.loreEntries, { userId: user.id, chatId: chatId, character, userName: config.persona?.name || '你', loreEntries: config.loreEntries, history: ejsHistory, model: modelName(chat.model), variables: vars });
  const prompt = assemblePrompt({
    character,
    history: ejsHistory,
    preset: config.preset,
    persona: config.persona,
    loreEntries: ejsLore.entries,
    regexRules: config.regexRules,
    trigger: 'normal',
    summary: memory.summary.text,
    memory: memory.memory,
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
    variables: vars,
  });
  // EJS 模板（ST-Prompt-Template 写法），在 QuickJS 沙盒里跑；生成阶段 setvar 不落库
  const ejs = await templatePrompt(prompt.messages, { userId: user.id, chatId: chatId, character, userName: config.persona?.name || '你', loreEntries: config.loreEntries, history: ejsHistory, model: modelName(chat.model), variables: vars, generateType: 'impersonate' });
  prompt.messages = ejs.messages;
  const who = config.persona?.name || '玩家';
  prompt.messages.push({
    role: 'system',
    content: `［代写］现在不要扮演${character.name}。请以「${who}」的身份、第一人称，写出${who}的下一句台词或动作（动作用 *星号* 包起来），60 字以内，只输出这一句本身，不要替${character.name}说话。${hint ? `方向：${hint}` : ''}`,
  });
  const maxTokens = Math.min(prompt.params.maxTokens, 200);
  const maxCost = pointsCost(prompt.tokens, maxTokens, modelName(chat.model));
  const reservation = reservePoints(user.id, Math.max(0, maxCost - dailyFreeRemaining(user.id)), `代写 · ${modelName(chat.model)}`, `chat:${chatId}`);
  if (!reservation.ok) return fail(`点数不足（本次最多需要 ${maxCost} 点）`, 402);
  const generationId = startGeneration(user.id, chatId, 'send', modelName(chat.model));
  const encoder = new TextEncoder();

  // 按实际接通的模型计费（failover 到备用线路时价格以备用模型为准）
  let billedModel = modelName(chat.model);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { /* 已断开 */ }
      };
      let full = '';
      let total = 0;
      try {
        for await (const event of streamChat(prompt.messages, { signal: request.signal, params: { ...prompt.params, maxTokens }, stop: prompt.stop, model: chat.model })) {
          if (event.type === 'route') {
            billedModel = event.model;
          } else if (event.type === 'content') { full += event.text; send({ type: 'delta', text: event.text }); }
          else if (event.type === 'usage') total = event.totalTokens;
        }
        const tokens = total || prompt.tokens + estimateTokens(full);
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens: prompt.tokens, completionTokens: estimateTokens(full), totalTokens: tokens, estimated: !total });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(prompt.tokens, total ? Math.max(0, total - prompt.tokens) : estimateTokens(full), billedModel), `chat:${chatId}`);
        send({ type: 'done', text: full.trim(), cost: settlement.cost, free: settlement.free, balance: settlement.balance });
      } catch (error) {
        const aborted = request.signal.aborted;
        finishGeneration(generationId, { status: aborted ? 'aborted' : 'error', promptTokens: prompt.tokens, completionTokens: estimateTokens(full), estimated: true, error: aborted ? null : String(error) });
        settleGeneration(user.id, reservation.reserved, pointsCost(prompt.tokens, estimateTokens(full), billedModel), `chat:${chatId}`);
        if (!aborted) send({ type: 'error', message: error instanceof Error ? error.message : '代写失败' });
      } finally {
        try { controller.close(); } catch { /* 已关闭 */ }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
}
