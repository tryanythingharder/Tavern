import { dataBankText } from '@/lib/data-bank';
import { recordMessageMeta, setMessageReasoning } from '@/lib/db';
import { nsfwBlock } from '@/lib/age-gate';
import { addReasoningToHistory, getGenPrefs, streamExtras, trimToEndSentence, wantsAutoContinue } from '@/lib/gen-prefs';
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
import { modelConfigured, modelName } from '@/lib/model';
import { runGeneration } from '@/lib/run-generation';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig } from '@/lib/resources-db';
import { memorySettings, snapshotChat, promptMemory } from '@/lib/memory';
import { retrieveMemories, vectorLoreHits } from '@/lib/vectors';
import { getOverride } from '@/lib/cards';
import { ensureStartingPoints, pointsCost, reservePoints } from '@/lib/points';

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
  return runGeneration({
    request,
    messages: prompt.messages,
    streamOptions: { params: prompt.params, model: chat.model, ...streamExtras(genPrefs, prompt.stop, { user: config.userName, char: character.name }) },
    generationId,
    userId: user.id,
    reserved: reservation.reserved,
    ref: `chat:${chat.id}`,
    model: modelName(chat.model),
    promptTokens: prompt.tokens,
    async complete(run) {
      const { full, trace, usage } = run;
      const { promptTokens, completionTokens, totalTokens } = run.tokens();
      const finalText = genPrefs.trimSentences ? trimToEndSentence(full) : full;
      const thought = trace.result();
      // 先写候选再结算：消息在生成期间没了（如整个会话被删）就写不进去，这次不扣费
      const candidate = finalText.trim() ? appendCandidate(message.id, finalText) : null;
      if (candidate) run.saved = true;
      if (finalText.trim() && !candidate) {
        finishGeneration(generationId, { model: run.billedModel, status: 'error', promptTokens, completionTokens, totalTokens, estimated: !usage, error: 'message gone' });
        run.settle(0);
        run.send({ type: 'error', message: '这条消息已经不在了，结果没有保存，本次不扣点' });
        return;
      }
      run.finish({ model: run.billedModel, status: 'done', promptTokens, completionTokens, totalTokens, estimated: !usage });
      const settlement = run.settle(pointsCost(promptTokens, completionTokens, run.billedModel));
      if (finalText.trim() && candidate) {
        run.donePayload = {
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
        recordMessageMeta(message.id, candidate.index, { model: run.billedModel, tokens: completionTokens, ms: Date.now() - run.startedAt, at: Date.now(), cut: trace.finish === 'length' });
        await applyReplyTemplates(finalText, { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history, model: run.billedModel, variables: chatVariables(chat.id, chat.character_id, { beforeId: message.id }) }).catch(() => null);
        snapshotChat(chat.id, user.id);
        run.send(run.donePayload);
        run.donePayload = null;
      } else {
        run.send({ type: 'error', message: '模型没有返回内容，请重试' });
      }
    },
    // 中断时保留已生成的部分，作为候选存下来；写不进去（消息已不存在）不扣点
    recover(run) {
      const partial = genPrefs.trimSentences ? trimToEndSentence(run.full) : run.full;
      if (!partial.trim()) return false;
      const candidate = appendCandidate(message.id, partial);
      if (candidate) setMessageReasoning(message.id, candidate.index, run.trace.result());
      if (candidate) recordMessageMeta(message.id, candidate.index, { model: run.billedModel, tokens: estimateTokens(run.full), ms: Date.now() - run.startedAt, at: Date.now() });
      return !candidate;
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
