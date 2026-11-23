import { dataBankText } from '@/lib/data-bank';
import { vectorLoreHits } from '@/lib/vectors';
import { GenTrace, addReasoningToHistory, getGenPrefs, streamExtras, trimToEndSentence, wantsAutoContinue } from '@/lib/gen-prefs';
import { nsfwBlock, roomNsfwBlock } from '@/lib/age-gate';
import { setRoomMessageReasoning } from '@/lib/rooms';
import type { Reasoning } from '@/lib/reasoning';
import { withGenerationLock } from '@/lib/gen-lock';
import { moderateText } from '@/lib/auto-moderation';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { getCharacterById, finishGeneration, startGeneration } from '@/lib/db';
import { roomLoreEntries, addRoomCandidate, addRoomMessage, editRoomMessage, buildRoomPrompt, deleteRoomMessage, getRoom, getRoomMessage, isLatestRoomMessage, listRoomMessages, pickSpeaker } from '@/lib/rooms';
import { loadRoomConfig, personaSender } from '@/lib/resources-db';
import { roomVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimatePromptTokens, estimateTokens } from '@/lib/usage';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';

import { CONTINUE_NUDGE, joinContinue } from '@/lib/continue';
import { autoRoomSummarize, roomPromptMemory } from '@/lib/room-memory';
import { characterNote, combinedNoteText } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

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

  const body = (await request.json().catch(() => ({}))) as { text?: string; speakerId?: string; auto?: boolean; force?: boolean; mode?: string; messageId?: number };
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
  const userRoomMessage = !auto ? addRoomMessage(room.id, 'user', null, text, personaSender(user.id, config.persona)) : null;
  const allMessages = listRoomMessages(room.id);
  // 重新生成：上下文到目标之前为止；继续：包含目标本身
  const messages = mode === 'regenerate' && target ? allMessages.filter((message) => message.id < target.id) : allMessages;
  // 自动推进时没有新的玩家输入：自然模式沿用最后一条玩家消息找名字
  const lastUserText = auto ? [...messages].reverse().find((message) => message.role === 'user')?.content ?? '' : text;
  // 换版/继续：发言者保持原来那位（ST swipe 不换角色）
  // ST「让 TA 发言」：指定成员，无视调度与静音
  const forced = body.force === true && typeof body.speakerId === 'string' && room.characterIds.includes(body.speakerId) ? body.speakerId : null;
  const speakerId = target?.speakerId ?? forced ?? pickSpeaker(room, messages, lastUserText, body.speakerId || room.speakerId);
  const speaker = speakerId ? getCharacterById(speakerId) : undefined;
  if (!speaker) return fail('房间里没有可发言的角色（可能都被静音了）', 400);

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
  const encoder = new TextEncoder();

  // 按实际接通的模型计费（failover 到备用线路时价格以备用模型为准）
  let billedModel = modelName(room.model);
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
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
      let settled = false;
      // 先把本轮发言者告诉客户端，界面可以显示「谁正在输入」
      send({ type: 'speaker', speakerId: speaker.id, name: speaker.name });
      try {
        for await (const event of streamChat(prompt, { signal: request.signal, params: config.preset.params, model: room.model, ...streamExtras(genPrefs, [], { user: config.userName, char: speaker.name }) })) {
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
        const usedPromptTokens = usage?.promptTokens ?? promptTokens;
        const completionTokens = usage?.completionTokens ?? estimateTokens(full);
        const totalTokens = usage?.totalTokens ?? usedPromptTokens + completionTokens;
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens: usedPromptTokens, completionTokens, totalTokens, estimated: !usage });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(usedPromptTokens, completionTokens, billedModel), `room:${room.id}`);
        settled = true;

        // 模型偶尔会在开头自己加「白露：」，去掉以免和气泡上的名字重复
        const stripSpeaker = (value: string) => value.replace(namePrefix, '');
        const raw = mode === 'continue' ? full : stripSpeaker(full);
        const finalText = genPrefs.trimSentences ? trimToEndSentence(raw) : raw;
        const thought = trace.result();
        if (finalText.trim()) {
          if (mode === 'continue' && target) {
            const content = joinContinue(target.content, finalText);
            editRoomMessage(target.id, content);
            const merged = mergeThought(target.thought, thought);
            if (thought) setRoomMessageReasoning(target.id, target.selected, merged);
            send({ type: 'done', messageId: target.id, speakerId: speaker.id, content, reasoning: merged, autoContinue: wantsAutoContinue(genPrefs, content, finalText, trace.finish), cost: settlement.cost, balance: settlement.balance });
          } else if (mode === 'regenerate' && target) {
            const candidate = addRoomCandidate(target.id, finalText);
            setRoomMessageReasoning(target.id, candidate.index, thought);
            send({ type: 'done', messageId: target.id, speakerId: speaker.id, content: finalText, reasoning: thought, autoContinue: wantsAutoContinue(genPrefs, finalText, finalText, trace.finish), candidateIndex: candidate.index, candidateCount: candidate.count, cost: settlement.cost, balance: settlement.balance });
          } else {
            const saved = addRoomMessage(room.id, 'assistant', speaker.id, finalText);
            if (thought) setRoomMessageReasoning(saved.id, 0, thought);
            send({ type: 'done', messageId: saved.id, speakerId: speaker.id, content: finalText, reasoning: thought, autoContinue: wantsAutoContinue(genPrefs, finalText, finalText, trace.finish), cost: settlement.cost, balance: settlement.balance });
          }
        } else {
          send({ type: 'error', message: '模型没有返回内容，请重试' });
        }
      } catch (error) {
        const rawPartial = mode === 'continue' ? full : full.replace(namePrefix, '');
        const partial = genPrefs.trimSentences ? trimToEndSentence(rawPartial) : rawPartial;
        if (partial.trim()) {
          const thought = trace.result();
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
        }
        const aborted = (error as Error)?.name === 'AbortError' || request.signal.aborted;
        finishGeneration(generationId, {
          model: billedModel,
          status: aborted ? 'aborted' : 'error',
          promptTokens,
          completionTokens: estimateTokens(full),
          estimated: true,
          error: aborted ? null : error instanceof Error ? error.message : String(error),
        });
        if (!settled) {
          settleGeneration(user.id, reservation.reserved, (connected && (full.trim() || aborted) ? pointsCost(promptTokens, estimateTokens(full), billedModel) : 0), `room:${room.id}`);
          settled = true;
        }
        if (!aborted) send({ type: 'error', message: error instanceof Error ? error.message : '生成失败' });
      } finally {
        // 群聊记忆摘要：到了间隔才在后台跑一段（不挡回复）
        void autoRoomSummarize(room.id, user.id);
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
export async function POST(request: Request, context: Params) {
  return withGenerationLock(`room:${(await context.params).id}`, () => handlePost(request, context));
}

// 续写的思考接在原来那段后面
function mergeThought(previous: Reasoning | null, next: Reasoning | null): Reasoning | null {
  if (!next) return previous;
  return previous ? { t: `${previous.t}\n\n${next.t}`, ms: previous.ms + next.ms } : next;
}
