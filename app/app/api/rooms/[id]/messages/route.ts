import { moderateText } from '@/lib/auto-moderation';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { getCharacterById, finishGeneration, startGeneration } from '@/lib/db';
import { addRoomMessage, buildRoomPrompt, deleteRoomMessage, getRoom, listRoomMessages, pickSpeaker } from '@/lib/rooms';
import { loadRoomConfig } from '@/lib/resources-db';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimatePromptTokens, estimateTokens } from '@/lib/usage';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { applyRegex } from '@/lib/prompt';

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

// POST /api/rooms/[id]/messages —— { text, speakerId? }
// 选出发言者 → 组装多角色提示词 → 流式生成 → 以该角色落库。SSE 事件与单聊一致。
export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const roomId = Number((await context.params).id);
  const room = getRoom(roomId, user.id);
  if (!room) return fail('房间不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { text?: string; speakerId?: string; auto?: boolean };
  const auto = body.auto === true;
  const text = String(body.text ?? '').trim();
  if (!auto && !text) return fail('消息不能为空', 400);
  if (text) {
    const verdict = await moderateText(text);
    if (!verdict.ok) return fail(verdict.message, 422);
  }

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429, quota.retryAfterSeconds);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置：请在 .env.local 设置三个 TAVERN_MODEL_* 变量', 500);

  const userRoomMessage = !auto ? addRoomMessage(room.id, 'user', null, text) : null;
  const messages = listRoomMessages(room.id);
  // 自动推进时没有新的玩家输入：自然模式沿用最后一条玩家消息找名字
  const lastUserText = auto ? [...messages].reverse().find((message) => message.role === 'user')?.content ?? '' : text;
  const speakerId = pickSpeaker(room, messages, lastUserText, body.speakerId || room.speakerId);
  const speaker = speakerId ? getCharacterById(speakerId) : undefined;
  if (!speaker) return fail('房间里没有可发言的角色（可能都被静音了）', 400);

  const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = room.characterIds
    .map((characterId) => getCharacterById(characterId)?.name)
    .filter((name): name is string => Boolean(name))
    .map(escapeRe);
  const namePrefix = names.length ? new RegExp(`^\\s*(?:${names.join('|')})\\s*[：:]\\s*`) : /^\s*$/;

  const config = loadRoomConfig(user.id);
  const prompt = buildRoomPrompt({
    room,
    messages,
    speaker,
    preset: config.preset,
    persona: config.persona,
    loreEntries: config.loreEntries,
    regexRules: config.regexRules,
  });
  const promptTokens = estimatePromptTokens(prompt);
  const maxCost = pointsCost(promptTokens + config.preset.params.maxTokens, modelName(room.model));
  const reservation = reservePoints(user.id, maxCost, `房间生成 · ${modelName(room.model)}`, `room:${room.id}`);
  if (!reservation.ok) {
    if (userRoomMessage) deleteRoomMessage(userRoomMessage.id);
    return fail(`点数不足（本次最多需要 ${maxCost} 点），请先签到或充值`, 402);
  }
  const generationId = startGeneration(user.id, null, 'room', modelName(room.model));
  const encoder = new TextEncoder();

  // 按实际接通的模型计费（failover 到备用线路时价格以备用模型为准）
  let billedModel = modelName(room.model);
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
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
      let settled = false;
      // 先把本轮发言者告诉客户端，界面可以显示「谁正在输入」
      send({ type: 'speaker', speakerId: speaker.id, name: speaker.name });
      try {
        for await (const event of streamChat(prompt, { signal: request.signal, params: config.preset.params, model: room.model })) {
          if (event.type === 'route') {
            billedModel = event.model;
          } else if (event.type === 'content') {
            full += event.text;
            send({ type: 'delta', text: event.text });
          } else if (event.type === 'usage') {
            usage = event;
          }
        }
        const usedPromptTokens = usage?.promptTokens ?? promptTokens;
        const completionTokens = usage?.completionTokens ?? estimateTokens(full);
        const totalTokens = usage?.totalTokens ?? usedPromptTokens + completionTokens;
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens: usedPromptTokens, completionTokens, totalTokens, estimated: !usage });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(totalTokens, billedModel), `room:${room.id}`);
        settled = true;

        // 模型偶尔会在开头自己加「白露：」，去掉以免和气泡上的名字重复
        const stripSpeaker = (value: string) => value.replace(namePrefix, '');
        const finalText = applyRegex(config.regexRules, stripSpeaker(full), { target: 'assistant', purpose: 'display', depth: 0 });
        if (finalText.trim()) {
          const saved = addRoomMessage(room.id, 'assistant', speaker.id, finalText);
          send({ type: 'done', messageId: saved.id, speakerId: speaker.id, content: finalText, cost: settlement.cost, balance: settlement.balance });
        } else {
          send({ type: 'error', message: '模型没有返回内容，请重试' });
        }
      } catch (error) {
        const partial = applyRegex(config.regexRules, full.replace(namePrefix, ''), { target: 'assistant', purpose: 'display', depth: 0 });
        if (partial.trim()) addRoomMessage(room.id, 'assistant', speaker.id, partial);
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
          settleGeneration(user.id, reservation.reserved, pointsCost(promptTokens + estimateTokens(full), billedModel), `room:${room.id}`);
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
