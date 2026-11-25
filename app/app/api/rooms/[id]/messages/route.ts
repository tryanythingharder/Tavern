import { dataBankText } from '@/lib/data-bank';
import { vectorLoreHits } from '@/lib/vectors';
import { addReasoningToHistory, getGenPrefs, streamExtras, trimToEndSentence, wantsAutoContinue } from '@/lib/gen-prefs';
import { roomNsfwBlock } from '@/lib/age-gate';
import { setRoomMessageReasoning } from '@/lib/rooms';
import type { Reasoning } from '@/lib/reasoning';
import { withAuthorizedLock } from '@/lib/gen-lock';
import { moderateText } from '@/lib/auto-moderation';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { getCharacterById, startGeneration } from '@/lib/db';
import { roomLoreEntries, addRoomCandidate, addRoomMessage, editRoomMessage, buildRoomPrompt, deleteRoomMessage, getRoom, getRoomMessage, isLatestRoomMessage, listRoomMessages, pickSpeaker } from '@/lib/rooms';
import { loadRoomConfig, personaSender } from '@/lib/resources-db';
import { roomVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName } from '@/lib/model';
import { runGeneration } from '@/lib/run-generation';
import { checkQuota, estimatePromptTokens } from '@/lib/usage';
import { ensureStartingPoints, pointsCost, reservePoints } from '@/lib/points';

import { CONTINUE_NUDGE, joinContinue } from '@/lib/continue';
import { autoRoomSummarize, roomPromptMemory } from '@/lib/room-memory';
import { characterNote, combinedNoteText } from '@/lib/memory';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const ALL_MUTED = '房间里的角色都被静音了，消息没有发出：先在房间设置里取消静音，或点输入框上方的成员头像点名让 TA 发言';

function fail(message: string, status: number, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ message }), { status, headers });
}

// GET /api/rooms/[id]/messages
export async function GET(_request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return fail('房间不存在', 404);
  return Response.json({ messages: listRoomMessages(room.id) });
}

// POST /api/rooms/[id]/messages —— { text, speakerId?, auto?, mode?: 'regenerate' | 'continue', messageId? }
// 选出发言者 → 组装多角色提示词 → 流式生成 → 以该角色落库。SSE 事件与单聊一致。
// mode=regenerate：重写最新一条角色消息，新回复作为候选（ST swipe），发言者不变。
// mode=continue：接着最新一条角色消息往下写（ST 继续），不插玩家消息。
async function handlePost(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const roomId = Number((await context.params).id);
  const room = getRoom(roomId, user.id);
  if (!room) return fail('房间不存在', 404);
  const blocked18 = await roomNsfwBlock(user.id, room.characterIds);
  if (blocked18) return fail(blocked18, 403);

  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { text?: string; speakerId?: string; auto?: boolean; force?: boolean; mode?: string; messageId?: number };
  const mode = body.mode === 'regenerate' || body.mode === 'continue' ? body.mode : null;
  const auto = body.auto === true || mode !== null;
  const text = mode ? '' : String(body.text ?? '').trim();
  if (!auto && !text) return fail('消息不能为空', 400);
  const target = mode ? getRoomMessage(room.id, Number(body.messageId)) : undefined;
  if (mode) {
    if (target?.attachment) return fail('插图消息不能继续或重新生成，可以「再画一张」', 400);
    if (!target || target.role !== 'assistant' || !target.speakerId) return fail(mode === 'continue' ? '只能继续角色消息' : '只能重新生成角色消息', 400);
    if (!isLatestRoomMessage(room.id, target.id)) return fail(mode === 'continue' ? '只能继续最新一条消息' : '只能重新生成最新一条消息', 400);
    if (mode === 'regenerate' && !listRoomMessages(room.id).some((message) => message.role === 'user' && message.id < target.id)) return fail('开场白只能在备选开场白之间切换', 400);
  }
  if (text) {
    const verdict = await moderateText(text);
    if (!verdict.ok) return fail(verdict.message, 422);
  }

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429, quota.retryAfterSeconds);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置：请在 .env.local 设置三个 TAVERN_MODEL_* 变量', 500);

  const config = loadRoomConfig(user.id, room);
  const genPrefs = getGenPrefs(user.id);
  const existing = listRoomMessages(room.id);
  // 重新生成：上下文到目标之前为止；继续：包含目标本身
  const before = mode === 'regenerate' && target ? existing.filter((message) => message.id < target.id) : existing;
  // 自动推进时没有新的玩家输入：自然模式沿用最后一条玩家消息找名字
  const lastUserText = auto ? [...before].reverse().find((message) => message.role === 'user')?.content ?? '' : text;
  // 先选发言者、后落玩家消息：成员全被静音时直接 400，玩家消息不入库（前端会把输入还给输入框）。
  // 选人只看角色发言的次数和上一位发言者，玩家消息在不在列表里结果都一样。
  // 换版/继续：发言者保持原来那位（ST swipe 不换角色）
  // ST「让 TA 发言」：指定成员，无视调度与静音
  const forced = body.force === true && typeof body.speakerId === 'string' && room.characterIds.includes(body.speakerId) ? body.speakerId : null;
  const speakerId = target?.speakerId ?? forced ?? pickSpeaker(room, before, lastUserText, body.speakerId || room.speakerId);
  const speaker = speakerId ? getCharacterById(speakerId) : undefined;
  if (!speaker) return fail(ALL_MUTED, 400);
  const userRoomMessage = !auto ? addRoomMessage(room.id, 'user', null, text, personaSender(user.id, config.persona)) : null;
  const messages = userRoomMessage ? listRoomMessages(room.id) : before;

  const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = room.characterIds
    .map((characterId) => getCharacterById(characterId)?.name)
    .filter((name): name is string => Boolean(name))
    .map(escapeRe);
  const namePrefix = names.length ? new RegExp(`^\\s*(?:${names.join('|')})\\s*[：:]\\s*`) : /^\s*$/;

  const vectorLore = await vectorLoreHits(user.id, roomLoreEntries(room, config.loreEntries, config.cardLoreLane), messages);
  const dataBank = (await dataBankText(user.id, { roomId: room.id, characterIds: room.characterIds }, messages)).text;
  const prompt = buildRoomPrompt({
    room,
    messages: addReasoningToHistory(messages, genPrefs),
    speaker,
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: config.loreEntries,
    cardLoreLane: config.cardLoreLane,
    vectorLore,
    dataBank,
    regexRules: config.regexRules,
    memory: roomPromptMemory(room.id, user.id),
    characterNoteText: combinedNoteText(roomPromptMemory(room.id, user.id)?.authorNote.text ?? '', characterNote(user.id, speaker.id)),
    variables: roomVariables(room.id, room.characterIds, mode === 'regenerate' && target ? { uptoId: target.id - 1 } : {}),
  });
  if (mode === 'continue') prompt.push({ role: 'system', content: CONTINUE_NUDGE });
  const promptTokens = estimatePromptTokens(prompt);
  const maxCost = pointsCost(promptTokens, config.preset.params.maxTokens, modelName(room.model));
  const reservation = reservePoints(user.id, maxCost, `${mode === 'continue' ? '房间继续' : mode === 'regenerate' ? '房间重新生成' : '房间生成'} · ${modelName(room.model)}`, `room:${room.id}`);
  if (!reservation.ok) {
    if (userRoomMessage) deleteRoomMessage(userRoomMessage.id);
    return fail(`点数不足（本次最多需要 ${maxCost} 点），请先签到或充值`, 402);
  }
  const generationId = startGeneration(user.id, null, 'room', modelName(room.model));
  // 模型偶尔会在开头自己加「白露：」，去掉以免和气泡上的名字重复
  const stripSpeaker = (value: string) => value.replace(namePrefix, '');
  return runGeneration({
    request,
    messages: prompt,
    streamOptions: { params: config.preset.params, model: room.model, ...streamExtras(genPrefs, [], { user: config.userName, char: speaker.name }) },
    generationId,
    userId: user.id,
    reserved: reservation.reserved,
    ref: `room:${room.id}`,
    model: modelName(room.model),
    promptTokens,
    // 先把本轮发言者告诉客户端，界面可以显示「谁正在输入」
    begin(run) {
      run.send({ type: 'speaker', speakerId: speaker.id, name: speaker.name });
    },
    async complete(run) {
      const { full, trace, usage } = run;
      const { promptTokens: usedPromptTokens, completionTokens, totalTokens } = run.tokens();
      run.finish({ model: run.billedModel, status: 'done', promptTokens: usedPromptTokens, completionTokens, totalTokens, estimated: !usage });
      const settlement = run.settle(pointsCost(usedPromptTokens, completionTokens, run.billedModel));

      const raw = mode === 'continue' ? full : stripSpeaker(full);
      const finalText = genPrefs.trimSentences ? trimToEndSentence(raw) : raw;
      const thought = trace.result();
      if (finalText.trim()) {
        if (mode === 'continue' && target) {
          const content = joinContinue(target.content, finalText);
          editRoomMessage(target.id, content);
          run.saved = true;
          const merged = mergeThought(target.thought, thought);
          run.donePayload = { type: 'done', messageId: target.id, speakerId: speaker.id, content, reasoning: merged, autoContinue: wantsAutoContinue(genPrefs, content, finalText, trace.finish), cost: settlement.cost, balance: settlement.balance };
          if (thought) setRoomMessageReasoning(target.id, target.selected, merged);
          run.send(run.donePayload);
          run.donePayload = null;
        } else if (mode === 'regenerate' && target) {
          const candidate = addRoomCandidate(target.id, finalText);
          run.saved = true;
          run.donePayload = { type: 'done', messageId: target.id, speakerId: speaker.id, content: finalText, reasoning: thought, autoContinue: wantsAutoContinue(genPrefs, finalText, finalText, trace.finish), candidateIndex: candidate.index, candidateCount: candidate.count, cost: settlement.cost, balance: settlement.balance };
          setRoomMessageReasoning(target.id, candidate.index, thought);
          run.send(run.donePayload);
          run.donePayload = null;
        } else {
          const row = addRoomMessage(room.id, 'assistant', speaker.id, finalText);
          run.saved = true;
          run.donePayload = { type: 'done', messageId: row.id, speakerId: speaker.id, content: finalText, reasoning: thought, autoContinue: wantsAutoContinue(genPrefs, finalText, finalText, trace.finish), cost: settlement.cost, balance: settlement.balance };
          if (thought) setRoomMessageReasoning(row.id, 0, thought);
          run.send(run.donePayload);
          run.donePayload = null;
        }
      } else {
        run.send({ type: 'error', message: '模型没有返回内容，请重试' });
      }
    },
    recover(run) {
      const rawPartial = mode === 'continue' ? run.full : run.full.replace(namePrefix, '');
      const partial = genPrefs.trimSentences ? trimToEndSentence(rawPartial) : rawPartial;
      if (!partial.trim()) return;
      const thought = run.trace.result();
      if (mode === 'continue' && target) {
        editRoomMessage(target.id, joinContinue(target.content, partial));
        if (thought) setRoomMessageReasoning(target.id, target.selected, mergeThought(target.thought, thought));
      } else if (mode === 'regenerate' && target) {
        const candidate = addRoomCandidate(target.id, partial);
        setRoomMessageReasoning(target.id, candidate.index, thought);
      } else {
        const saved = addRoomMessage(room.id, 'assistant', speaker.id, partial);
        if (thought) setRoomMessageReasoning(saved.id, 0, thought);
      }
    },
    // 群聊记忆摘要：到了间隔才在后台跑一段（不挡回复）
    end() {
      void autoRoomSummarize(room.id, user.id);
    },
  });
}

// 同一会话同时只跑一条生成；流期间发心跳防代理断连
export async function POST(request: Request, context: Params) {
  return withAuthorizedLock(async () => {
    const user = await getCurrentUser();
    if (!user) return fail('未登录', 401);
    if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
    const room = getRoom(Number((await context.params).id), user.id);
    if (!room) return fail('房间不存在', 404);
    return `room:${room.id}`;
  }, () => handlePost(request, context));
}

// 续写的思考接在原来那段后面
function mergeThought(previous: Reasoning | null, next: Reasoning | null): Reasoning | null {
  if (!next) return previous;
  return previous ? { t: `${previous.t}\n\n${next.t}`, ms: previous.ms + next.ms } : next;
}
