import { dataBankText } from '@/lib/data-bank';
import { vectorLoreHits } from '@/lib/vectors';
import { getGenPrefs, streamExtras, trimToEndSentence } from '@/lib/gen-prefs';
import { nsfwBlock, roomNsfwBlock } from '@/lib/age-gate';
import { withAuthorizedLock } from '@/lib/gen-lock';
import { canGenerate, getCurrentUser } from '@/lib/auth';
import { finishGeneration, getCharacterById, startGeneration } from '@/lib/db';
import { roomLoreEntries, buildRoomPrompt, getRoom, listRoomMessages } from '@/lib/rooms';
import { loadRoomConfig } from '@/lib/resources-db';
import { roomVariables } from '@/lib/mvu-server';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimatePromptTokens, estimateTokens } from '@/lib/usage';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/rooms/[id]/impersonate { hint? }
// ST 的「代写」（群聊同样可用）：以玩家身份写下一句，只流式回到输入框，不落库。
async function handlePost(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return fail('房间不存在', 404);
  const blocked18 = await roomNsfwBlock(user.id, room.characterIds);
  if (blocked18) return fail(blocked18, 403);
  const body = (await request.json().catch(() => ({}))) as { hint?: string };
  const hint = String(body.hint ?? '').trim().slice(0, 300);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置', 500);

  const messages = listRoomMessages(room.id);
  // 提示词仍以一位成员为「本轮发言人」组装（拿到全部人设和世界书），末尾再改成代写指令
  const lastSpeaker = [...messages].reverse().find((message) => message.role === 'assistant')?.speakerId;
  const speaker = getCharacterById(lastSpeaker ?? room.characterIds[0] ?? '');
  if (!speaker) return fail('房间里没有角色', 400);
  const config = loadRoomConfig(user.id, room);
  const genPrefs = getGenPrefs(user.id);
  const vectorLore = await vectorLoreHits(user.id, roomLoreEntries(room, config.loreEntries, config.cardLoreLane), messages);
  const dataBank = (await dataBankText(user.id, { roomId: room.id, characterIds: room.characterIds }, messages)).text;
  const prompt = buildRoomPrompt({
    room,
    messages,
    speaker,
    preset: config.preset,
    persona: config.persona,
    userName: config.userName,
    loreEntries: config.loreEntries,
    cardLoreLane: config.cardLoreLane,
    vectorLore,
    dataBank,
    regexRules: config.regexRules,
    variables: roomVariables(room.id, room.characterIds),
  });
  const who = config.userName;
  prompt.push({
    role: 'system',
    content: `［代写］忽略上面「本轮发言人」的要求，现在不要扮演任何角色。请以「${who}」的身份、第一人称，写出${who}的下一句台词或动作（动作用 *星号* 包起来），60 字以内，只输出这一句本身，不要替其他角色说话。${hint ? `方向：${hint}` : ''}`,
  });
  const promptTokens = estimatePromptTokens(prompt);
  const maxTokens = Math.min(config.preset.params.maxTokens, 200);
  const maxCost = pointsCost(promptTokens, maxTokens, modelName(room.model));
  const reservation = reservePoints(user.id, maxCost, `房间代写 · ${modelName(room.model)}`, `room:${room.id}`);
  if (!reservation.ok) return fail(`点数不足（本次最多需要 ${maxCost} 点）`, 402);
  const generationId = startGeneration(user.id, null, 'impersonate', modelName(room.model));
  const encoder = new TextEncoder();
  let billedModel = modelName(room.model);
  // 一条线路都没接通（全部失败）就不扣点；接通后失败且没产出任何正文也不扣
  let connected = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { /* 已断开 */ }
      };
      let full = '';
      let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
      try {
        for await (const event of streamChat(prompt, { signal: request.signal, params: { ...config.preset.params, maxTokens }, model: room.model, ...streamExtras(genPrefs, [], { user: config.userName, char: speaker.name }) })) {
          if (event.type === 'route') { connected = true; billedModel = event.model; }
          else if (event.type === 'content') { full += event.text; send({ type: 'delta', text: event.text }); }
          else if (event.type === 'usage') usage = event;
        }
        const used = usage?.promptTokens ?? promptTokens;
        const completion = usage?.completionTokens ?? estimateTokens(full);
        finishGeneration(generationId, { model: billedModel, status: 'done', promptTokens: used, completionTokens: completion, totalTokens: used + completion, estimated: !usage });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(used, completion, billedModel), `room:${room.id}`);
        send({ type: 'done', text: (genPrefs.trimSentences ? trimToEndSentence(full) : full).trim(), cost: settlement.cost, balance: settlement.balance });
      } catch (error) {
        const aborted = request.signal.aborted;
        finishGeneration(generationId, { status: aborted ? 'aborted' : 'error', promptTokens, completionTokens: estimateTokens(full), estimated: true, error: aborted ? null : String(error) });
        settleGeneration(user.id, reservation.reserved, (connected && (full.trim() || aborted) ? pointsCost(promptTokens, estimateTokens(full), billedModel) : 0), `room:${room.id}`);
        if (!aborted) send({ type: 'error', message: error instanceof Error ? error.message : '代写失败' });
      } finally {
        try { controller.close(); } catch { /* 已关闭 */ }
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
}

// 同一会话同时只跑一条生成；流期间发心跳防代理断连
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAuthorizedLock(async () => {
    const user = await getCurrentUser();
    if (!user) return fail('未登录', 401);
    if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
    const room = getRoom(Number((await context.params).id), user.id);
    if (!room) return fail('房间不存在', 404);
    return `room:${room.id}`;
  }, () => handlePost(request, context));
}
