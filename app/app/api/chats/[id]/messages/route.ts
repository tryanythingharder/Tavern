import { withGenerationLock } from '@/lib/gen-lock';
import { applyReplyTemplates, templateLore, templatePrompt } from '@/lib/ejs-server';
import { moderateText } from '@/lib/auto-moderation';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import {
  addMessage,
  deleteMessage,
  finishGeneration,
  getChat,
  getCharacterById,
  listMessages,
  listMessagesPage,
  startGeneration,
  touchChat,
} from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { chatVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig, personaSender } from '@/lib/resources-db';
import { memorySettings, ragChunks, refreshSummary, snapshotChat, promptMemory } from '@/lib/memory';
import { getOverride } from '@/lib/cards';
import { autoSummarize } from '@/lib/memory-llm';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';
import { toMessageView } from '@/lib/chat-view';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ message }), { status, headers });
}

// GET /api/chats/[id]/messages?before=&limit= —— 对齐消息 / 向上翻页
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  const chat = getChat(Number(id), user.id);
  if (!chat) return fail('会话不存在', 404);
  const url = new URL(request.url);
  const before = Number(url.searchParams.get('before')) || null;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 60));
  const page = listMessagesPage(chat.id, before, limit);
  return Response.json({ messages: page.messages.map(toMessageView), hasMore: page.hasMore });
}

// POST /api/chats/[id]/messages
// 配额校验 → 保存玩家消息 → 组装提示词（预设/世界书/正则/身份）→ 流式调用模型 → 落库并记账。SSE 事件：
//   data: {"type":"delta","text":"…"}      正文增量
//   data: {"type":"done","messageId":12}   完成（content 是应用展示正则后的最终文本）
//   data: {"type":"error","message":"…"}   失败（已保存的玩家消息保留）
async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);

  const { id } = await context.params;
  const chatId = Number(id);
  const chat = getChat(chatId, user.id);
  if (!chat) return fail('会话不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? '').trim();
  if (!text) return fail('消息不能为空', 400);
  if (text) {
    const verdict = await moderateText(text);
    if (!verdict.ok) return fail(verdict.message, 422);
  }

  // 先校验再落库：被限流时不该留下一条没有回复的玩家消息
  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429, quota.retryAfterSeconds);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置：请在 .env.local 设置三个 TAVERN_MODEL_* 变量', 500);

  const character = getCharacterById(chat.character_id);
  if (!character) return fail('角色不存在', 404);

  const config = loadGenerationConfig(user.id, chat);
  const userMessage = addMessage(chatId, 'user', text, undefined, undefined, personaSender(user.id, config.persona));
  const memory = memorySettings(chat);
  const history = listMessages(chatId);
  // 摘要按间隔自动刷新；检索只从「最近 8 条」之前的历史里挑片段
  const summary = refreshSummary(chatId, character.name, history);
  const rag = memory.ragPrefs.enabled ? ragChunks(history, text, memory.ragPrefs.topK) : [];
  const vars = chatVariables(chat.id, chat.character_id);
  const ejsLore = await templateLore(config.loreEntries, { userId: user.id, chatId: chatId, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars });
  const prompt = assemblePrompt({
    character,
    history,
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: ejsLore.entries,
    regexRules: config.regexRules,
    trigger: 'normal',
    ...promptMemory({ ...chat, summary: JSON.stringify(summary) }, user.id),
    rag,
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
    variables: vars,
  });
  // EJS 模板（ST-Prompt-Template 写法），在 QuickJS 沙盒里跑；生成阶段 setvar 不落库
  const ejs = await templatePrompt(prompt.messages, { userId: user.id, chatId: chatId, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars, generateType: 'normal' });
  prompt.messages = ejs.messages;
  // 先按最大可能成本预扣，避免余额 1 点也能跑完一次高消耗生成
  const maxCost = pointsCost(prompt.tokens, prompt.params.maxTokens, modelName(chat.model));
  const reservation = reservePoints(user.id, Math.max(0, maxCost - dailyFreeRemaining(user.id)), `对话生成 · ${modelName(chat.model)}`, `chat:${chatId}`);
  if (!reservation.ok) {
    deleteMessage(userMessage.id);
    return fail(`点数不足（本次最多需要 ${maxCost} 点），请先签到或充值`, 402);
  }
  const generationId = startGeneration(user.id, chatId, 'send', modelName(chat.model));
  const encoder = new TextEncoder();

  // 按实际接通的模型计费（failover 到备用线路时价格以备用模型为准）
  let billedModel = modelName(chat.model);
  // 一条线路都没接通（全部失败）就不扣点；接通后失败且没产出任何正文也不扣
  let connected = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // 客户端已断开，继续把生成结果落库即可
        }
      };
      let full = '';
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
      let settled = false;
      try {
        for await (const event of streamChat(prompt.messages, { signal: request.signal, params: prompt.params, stop: prompt.stop, model: chat.model })) {
          if (event.type === 'route') {
            connected = true;
            billedModel = event.model;
          } else if (event.type === 'content') {
            full += event.text;
            send({ type: 'delta', text: event.text });
          } else if (event.type === 'usage') {
            usage = event;
          }
        }
        const promptTokens = usage?.promptTokens ?? prompt.tokens;
        const completionTokens = usage?.completionTokens ?? estimateTokens(full);
        const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens, completionTokens, totalTokens, estimated: !usage });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(promptTokens, completionTokens, billedModel), `chat:${chatId}`);
        settled = true;
        // 落库原文；「仅显示」正则在渲染时套用（和 ST 一样，状态栏 HTML 不会被当成历史喂回模型）
        const finalText = full;
        if (finalText.trim()) {
          const saved = addMessage(chatId, 'assistant', finalText, [finalText]);
          // 回复里的 EJS（如 setvar）在这一步才真正写变量
          await applyReplyTemplates(finalText, { userId: user.id, chatId, character, userName: config.userName, loreEntries: config.loreEntries, history: listMessages(chatId), model: billedModel, variables: chatVariables(chat.id, chat.character_id) }).catch(() => null);
          snapshotChat(chatId, user.id);
          // 到间隔了就在后台更新模型摘要（不挡这次回复）
          void autoSummarize(chatId, user.id);
          send({ type: 'done', messageId: saved.id, content: finalText, candidateCount: 1, candidateIndex: 0, cost: settlement.cost, free: settlement.free, balance: settlement.balance });
        } else {
          touchChat(chatId);
          send({ type: 'done', messageId: null, cost: settlement.cost, free: settlement.free, balance: settlement.balance });
        }
      } catch (error) {
        // 中断或失败时，把已经生成的部分保存下来，并按实际 token 结算预扣
        const partial = full;
        if (partial.trim()) addMessage(chatId, 'assistant', partial, [partial]);
        const aborted = (error as Error)?.name === 'AbortError' || request.signal.aborted;
        finishGeneration(generationId, {
          model: billedModel,
          status: aborted ? 'aborted' : 'error',
          promptTokens: prompt.tokens,
          completionTokens: estimateTokens(full),
          estimated: true,
          error: aborted ? null : error instanceof Error ? error.message : String(error),
        });
        if (!settled) {
          settleGeneration(user.id, reservation.reserved, (connected && (full.trim() || aborted) ? pointsCost(prompt.tokens, estimateTokens(full), billedModel) : 0), `chat:${chatId}`);
          settled = true;
        }
        if (!aborted) send({ type: 'error', message: error instanceof Error ? error.message : '生成失败' });
      } finally {
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// 同一会话同时只跑一条生成；流期间发心跳防代理断连
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withGenerationLock(`chat:${(await context.params).id}`, () => handlePost(request, context));
}
