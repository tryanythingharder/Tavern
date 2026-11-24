import { dataBankText } from '@/lib/data-bank';
import { recordMessageMeta, setMessageReasoning } from '@/lib/db';
import { nsfwBlock } from '@/lib/age-gate';
import { GenTrace, addReasoningToHistory, getGenPrefs, streamExtras, trimToEndSentence, wantsAutoContinue } from '@/lib/gen-prefs';
import { withAuthorizedLock } from '@/lib/gen-lock';
import { applyReplyTemplates, templateLore, templatePrompt } from '@/lib/ejs-server';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import {
  appendCandidate,
  finishGeneration,
  getCharacterById,
  getChat,
  getOwnedMessage,
  listMessagesBefore,
  startGeneration,
} from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { chatVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig } from '@/lib/resources-db';
import { memorySettings, snapshotChat, promptMemory } from '@/lib/memory';
import { retrieveMemories, vectorLoreHits } from '@/lib/vectors';
import { getOverride } from '@/lib/cards';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ message }), { status, headers });
}

// POST /api/messages/[id]/regenerate
// 重新生成一条角色消息：把新结果作为新候选追加，旧候选保留，可来回切换。
// 上下文只取这条消息之前的消息，不包含它自己。
async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);

  const { id } = await context.params;
  const message = getOwnedMessage(Number(id), user.id);
  if (!message) return fail('消息不存在', 404);
  if (message.role !== 'assistant') return fail('只有角色消息可以重新生成', 400);

  const chat = getChat(message.chat_id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const character = getCharacterById(chat.character_id);
  if (!character) return fail('角色不存在', 404);
  const blocked18 = await nsfwBlock(user.id, character);
  if (blocked18) return fail(blocked18, 403);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429, quota.retryAfterSeconds);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置：请在 .env.local 设置三个 TAVERN_MODEL_* 变量', 500);

  const config = loadGenerationConfig(user.id, chat);
  const genPrefs = getGenPrefs(user.id);
  const history = listMessagesBefore(chat.id, message.id);
  const memory = memorySettings(chat);
  const lastUser = [...history].reverse().find((item) => item.role === 'user');
  const rag = (await retrieveMemories(chat.id, history, lastUser?.content ?? '', memory.ragPrefs)).chunks;
  const vars = chatVariables(chat.id, chat.character_id, { beforeId: message.id });
  const ejsLore = await templateLore(config.loreEntries, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars });
  const vectorLore = await vectorLoreHits(user.id, ejsLore.entries, history);
  const dataBank = (await dataBankText(user.id, { characterId: chat.character_id, chatId: chat.id }, history)).text;
  const prompt = assemblePrompt({
    character,
    history: addReasoningToHistory(history, genPrefs),
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: ejsLore.entries,
    vectorLore,
    dataBank,
    regexRules: config.regexRules,
    trigger: 'regenerate',
    ...promptMemory(chat, user.id),
    rag,
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
    variables: vars,
  });
  // EJS 模板（ST-Prompt-Template 写法），在 QuickJS 沙盒里跑；生成阶段 setvar 不落库
  const ejs = await templatePrompt(prompt.messages, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history: history, model: modelName(chat.model), variables: vars, generateType: 'regenerate' });
  prompt.messages = ejs.messages;
  const maxCost = pointsCost(prompt.tokens, prompt.params.maxTokens, modelName(chat.model));
  const reservation = reservePoints(user.id, maxCost, `重新生成 · ${modelName(chat.model)}`, `chat:${chat.id}`);
  if (!reservation.ok) return fail(`点数不足（本次最多需要 ${maxCost} 点），请先签到或充值`, 402);
  const generationId = startGeneration(user.id, chat.id, 'regenerate', modelName(chat.model));
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
          // 客户端已断开
        }
      };
      let full = '';
      const trace = new GenTrace();
      const startedAt = Date.now();
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
      let settled = false;
      // 结果已落库 / 生成记录已收尾 / done 已准备好：之后的步骤再抛错，catch 里不能再存一次部分结果、不能把 done 改成 error
      let saved = false;
      let finished = false;
      let donePayload: Record<string, unknown> | null = null;
      try {
        for await (const event of streamChat(prompt.messages, { signal: request.signal, params: prompt.params, model: chat.model, ...streamExtras(genPrefs, prompt.stop, { user: config.userName, char: character.name }) })) {
          if (event.type === 'route') {
            connected = true;
            billedModel = event.model;
          } else if (event.type === 'content') {
            trace.onContent();
            full += event.text;
            send({ type: 'delta', text: event.text });
          } else if (event.type === 'reasoning') {
            trace.onReasoning(event.text);
            send({ type: 'reasoning', text: event.text });
          } else if (event.type === 'finish') {
            trace.finish = event.reason;
          } else if (event.type === 'usage') {
            usage = event;
          }
        }
        const promptTokens = usage?.promptTokens ?? prompt.tokens;
        const completionTokens = usage?.completionTokens ?? estimateTokens(full);
        const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;
        const finalText = genPrefs.trimSentences ? trimToEndSentence(full) : full;
        const thought = trace.result();
        // 先写候选再结算：消息在生成期间没了（如整个会话被删）就写不进去，这次不扣费
        const candidate = finalText.trim() ? appendCandidate(message.id, finalText) : null;
        if (candidate) saved = true;
        if (finalText.trim() && !candidate) {
          finishGeneration(generationId, { model: billedModel, status: 'error', promptTokens, completionTokens, totalTokens, estimated: !usage, error: 'message gone' });
          settleGeneration(user.id, reservation.reserved, 0, `chat:${chat.id}`);
          settled = true;
          send({ type: 'error', message: '这条消息已经不在了，结果没有保存，本次不扣点' });
          return;
        }
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens, completionTokens, totalTokens, estimated: !usage });
        finished = true;
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(promptTokens, completionTokens, billedModel), `chat:${chat.id}`);
        settled = true;
        if (finalText.trim() && candidate) {
          donePayload = {
            type: 'done',
            messageId: message.id,
            content: finalText,
            candidateIndex: candidate.index,
            candidateCount: candidate.count,
            reasoning: thought,
            cut: trace.finish === 'length',
            autoContinue: wantsAutoContinue(genPrefs, finalText, finalText, trace.finish),
            cost: settlement.cost,
            balance: settlement.balance,
          };
          setMessageReasoning(message.id, candidate.index, thought);
          if (candidate) recordMessageMeta(message.id, candidate.index, { model: billedModel, tokens: completionTokens, ms: Date.now() - startedAt, at: Date.now(), cut: trace.finish === 'length' });
          await applyReplyTemplates(finalText, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history, model: billedModel, variables: chatVariables(chat.id, chat.character_id, { beforeId: message.id }) }).catch(() => null);
          snapshotChat(chat.id, user.id);
          send(donePayload);
          donePayload = null;
        } else {
          send({ type: 'error', message: '模型没有返回内容，请重试' });
        }
      } catch (error) {
        // 中断时保留已生成的部分，作为候选存下来
        const partial = genPrefs.trimSentences ? trimToEndSentence(full) : full;
        let lost = false;
        if (!saved && partial.trim()) {
          const candidate = appendCandidate(message.id, partial);
          lost = !candidate;
          if (candidate) setMessageReasoning(message.id, candidate.index, trace.result());
          if (candidate) recordMessageMeta(message.id, candidate.index, { model: billedModel, tokens: estimateTokens(full), ms: Date.now() - startedAt, at: Date.now() });
        }
        const aborted = (error as Error)?.name === 'AbortError' || request.signal.aborted;
        if (!finished) finishGeneration(generationId, {
          model: billedModel,
          status: aborted ? 'aborted' : 'error',
          promptTokens: prompt.tokens,
          completionTokens: estimateTokens(full),
          estimated: true,
          error: aborted ? null : error instanceof Error ? error.message : String(error),
        });
        if (!settled) {
          // 部分结果没能写进去（消息已不存在）同样不扣
          settleGeneration(user.id, reservation.reserved, (!lost && connected && (full.trim() || aborted) ? pointsCost(prompt.tokens, estimateTokens(full), billedModel) : 0), `chat:${chat.id}`);
          settled = true;
        }
        if (donePayload) {
          // 回复已经保存，只是保存之后的步骤出错：照常告诉前端完成，错误记日志
          console.error('[generation] 回复已保存，后续步骤出错', error);
          send(donePayload);
        } else if (!aborted) send({ type: 'error', message: error instanceof Error ? error.message : '生成失败' });
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
  return withAuthorizedLock(async () => {
    const user = await getCurrentUser();
    if (!user) return fail('未登录', 401);
    if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
    const message = getOwnedMessage(Number((await context.params).id), user.id);
    if (!message) return fail('消息不存在', 404);
    return `chat:${message.chat_id}`;
  }, () => handlePost(request, context));
}
