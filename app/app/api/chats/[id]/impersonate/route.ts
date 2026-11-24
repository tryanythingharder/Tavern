import { dataBankText } from '@/lib/data-bank';
import { vectorLoreHits } from '@/lib/vectors';
import { getGenPrefs, streamExtras, trimToEndSentence } from '@/lib/gen-prefs';
import { nsfwBlock } from '@/lib/age-gate';
import { withAuthorizedLock } from '@/lib/gen-lock';
import { templateLore, templatePrompt } from '@/lib/ejs-server';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { finishGeneration, getChat, getCharacterById, listMessages, startGeneration } from '@/lib/db';
import { assemblePrompt } from '@/lib/prompt';
import { chatVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName } from '@/lib/model';
import { runGeneration } from '@/lib/run-generation';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig } from '@/lib/resources-db';
import { promptMemory } from '@/lib/memory';
import { getOverride } from '@/lib/cards';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/chats/[id]/impersonate { hint? }
// ST 的「代写」（Impersonate）：让模型以玩家人设写下一句，只流式回到输入框，不落库。
async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const chatId = Number((await context.params).id);
  const chat = getChat(chatId, user.id);
  if (!chat) return fail('会话不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { hint?: string; mode?: string; prompt?: string; length?: number };
  const hint = String(body.hint ?? '').trim().slice(0, 300);
  // 斜杠命令 /gen（带聊天上下文，按提示生成）、/genraw（只发提示本身）：同样只回文字、不落库，结果交给下一条命令（{{pipe}}）
  const mode = body.mode === 'gen' || body.mode === 'genraw' ? body.mode : 'impersonate';
  const genPrompt = String(body.prompt ?? '').trim().slice(0, 8000);
  if (mode !== 'impersonate' && !genPrompt) return fail('要写提示内容', 400);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置', 500);
  const character = getCharacterById(chat.character_id);
  if (!character) return fail('角色不存在', 404);
  const blocked18 = await nsfwBlock(user.id, character);
  if (blocked18) return fail(blocked18, 403);

  const config = loadGenerationConfig(user.id, chat);
  const genPrefs = getGenPrefs(user.id);
  const ejsHistory = listMessages(chatId);
  const vars = chatVariables(chat.id, chat.character_id);
  const ejsLore = await templateLore(config.loreEntries, { userId: user.id, chatId: chatId, character, userName: config.userName, loreEntries: config.loreEntries, history: ejsHistory, model: modelName(chat.model), variables: vars });
  const vectorLore = await vectorLoreHits(user.id, ejsLore.entries, ejsHistory);
  const dataBank = (await dataBankText(user.id, { characterId: chat.character_id, chatId: chat.id }, ejsHistory)).text;
  const prompt = assemblePrompt({
    character,
    history: ejsHistory,
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: ejsLore.entries,
    vectorLore,
    dataBank,
    regexRules: config.regexRules,
    trigger: 'normal',
    generationType: mode === 'impersonate' ? 'impersonate' : 'quiet',
    ...promptMemory(chat, user.id),
    card: getOverride(user.id, chat.character_id),
    model: modelName(chat.model),
    variables: vars,
  });
  // EJS 模板（ST-Prompt-Template 写法），在 QuickJS 沙盒里跑；生成阶段 setvar 不落库
  const ejs = await templatePrompt(prompt.messages, { userId: user.id, chatId: chatId, character, userName: config.userName, loreEntries: config.loreEntries, history: ejsHistory, model: modelName(chat.model), variables: vars, generateType: 'impersonate' });
  prompt.messages = ejs.messages;
  const who = config.userName;
  if (mode === 'genraw') prompt.messages = [{ role: 'user', content: genPrompt }];
  else if (mode === 'gen') prompt.messages.push({ role: 'system', content: genPrompt });
  else prompt.messages.push({
    role: 'system',
    content: `［代写］现在不要扮演${character.name}。请以「${who}」的身份、第一人称，写出${who}的下一句台词或动作（动作用 *星号* 包起来），60 字以内，只输出这一句本身，不要替${character.name}说话。${hint ? `方向：${hint}` : ''}`,
  });
  if (mode === 'genraw') prompt.tokens = estimateTokens(genPrompt);
  const length = Number(body.length);
  const maxTokens = mode === 'impersonate' ? Math.min(prompt.params.maxTokens, 200) : Number.isInteger(length) && length > 0 ? Math.min(length, prompt.params.maxTokens) : prompt.params.maxTokens;
  const maxCost = pointsCost(prompt.tokens, maxTokens, modelName(chat.model));
  const reservation = reservePoints(user.id, Math.max(0, maxCost - dailyFreeRemaining(user.id)), `${mode === 'impersonate' ? '代写' : '斜杠生成'} · ${modelName(chat.model)}`, `chat:${chatId}`);
  if (!reservation.ok) return fail(`点数不足（本次最多需要 ${maxCost} 点）`, 402);
  const generationId = startGeneration(user.id, chatId, 'impersonate', modelName(chat.model));
  return runGeneration({
    request,
    kind: 'impersonate',
    messages: prompt.messages,
    streamOptions: { params: { ...prompt.params, maxTokens }, model: chat.model, ...streamExtras(genPrefs, prompt.stop, { user: config.userName, char: character.name }) },
    generationId,
    userId: user.id,
    reserved: reservation.reserved,
    ref: `chat:${chatId}`,
    model: modelName(chat.model),
    promptTokens: prompt.tokens,
    errorMessage: '代写失败',
    complete(run) {
      const { full } = run;
      const total = run.usage?.totalTokens ?? 0;
      const tokens = total || prompt.tokens + estimateTokens(full);
      finishGeneration(generationId, { model: run.billedModel, status: 'done', promptTokens: prompt.tokens, completionTokens: estimateTokens(full), totalTokens: tokens, estimated: !total });
      const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(prompt.tokens, total ? Math.max(0, total - prompt.tokens) : estimateTokens(full), run.billedModel), `chat:${chatId}`);
      run.send({ type: 'done', text: (genPrefs.trimSentences ? trimToEndSentence(full) : full).trim(), cost: settlement.cost, free: settlement.free, balance: settlement.balance });
    },
  });
}

// 同一会话同时只跑一条生成；流期间发心跳防代理断连
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAuthorizedLock(async () => {
    const user = await getCurrentUser();
    if (!user) return fail('未登录', 401);
    if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
    const chat = getChat(Number((await context.params).id), user.id);
    if (!chat) return fail('会话不存在', 404);
    return `chat:${chat.id}`;
  }, () => handlePost(request, context));
}
