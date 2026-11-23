import { canGenerate, getCurrentUser } from '@/lib/auth';
import { finishGeneration, getCharacterById, startGeneration, type DbCharacter } from '@/lib/db';
import { historyText, imageModeOf, writeImagePromptWith } from '@/lib/image-prompt';
import { loadRoomConfig } from '@/lib/resources-db';
import { roomNsfwBlock } from '@/lib/age-gate';
import { generateImage, imageConfig, imageConfigured, imageCost } from '@/lib/media';
import { characterReference, referenceLeadMany, roomImages, type CharacterReference } from '@/lib/image-ref';
import { addRoomMessage, getRoom, getRoomMessage, listRoomMessages, setRoomMessageAttachment, textRoomMessages } from '@/lib/rooms';
import { balance, grantPoints, reservePoints } from '@/lib/points';
import { checkQuota } from '@/lib/usage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return Response.json({ message }, { status });
}

// POST /api/rooms/[id]/image —— { mode, characterId?, hint?, prompt? } 群聊生图，作为「画给某位成员」的一条插图消息
// 画谁：characterId（成员）；不传时 scene/last 取最近发言的角色。当前场景会把最近出场的（最多 3 位）成员一起画，各带自己的参考图。
// 人物参考与单聊同一套（lib/image-ref.ts）：定妆照 → 封面 → 头像 → 内置立绘 → 本群聊里第一张给 TA 的立绘。
export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return fail('房间不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { prompt?: string; mode?: string; hint?: string; characterId?: string };
  const mode = imageModeOf(body.mode ?? 'scene');
  let prompt = String(body.prompt ?? '').trim().slice(0, 900);
  if (mode === 'custom' && !prompt) return fail('请写一句画面描述', 400);
  if (!imageConfigured()) return fail('生图还没开通：请管理员在后台「接口配置 · 生图」里填好', 503);
  const blocked18 = await roomNsfwBlock(user.id, room.characterIds);
  if (blocked18) return fail(blocked18, 403);

  const members = room.characterIds.map((id) => getCharacterById(id)).filter((item): item is DbCharacter => Boolean(item));
  if (!members.length) return fail('房间里没有角色', 400);
  const texts = textRoomMessages(listRoomMessages(room.id));
  const recentSpeakers = [...new Set(texts.slice(-8).reverse().filter((item) => item.role === 'assistant' && item.speakerId).map((item) => item.speakerId as string))];
  const byId = (id: string | null | undefined) => members.find((item) => item.id === id);
  const focus = byId(body.characterId) ?? byId(recentSpeakers[0]) ?? members[0];
  const cast = mode === 'scene' ? [focus, ...recentSpeakers.map(byId).filter((item): item is DbCharacter => Boolean(item) && item!.id !== focus.id)].slice(0, 3) : [focus];

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  const cost = imageCost();
  const reservation = reservePoints(user.id, cost, '生图', `room:${room.id}`);
  if (!reservation.ok) return fail(`点数不足（生图需要 ${cost} 点）`, 402);
  const refund = () => { if (reservation.reserved > 0) grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust'); };

  const images = roomImages(room.id);
  const refs: { character: DbCharacter; ref: CharacterReference }[] = [];
  if (imageConfig().reference) {
    for (const character of cast) {
      const ref = await characterReference(character, images.filter((item) => item.speakerId === character.id), user.id);
      if (ref) refs.push({ character, ref });
    }
  }
  const focusHasRef = refs.some((item) => item.character.id === focus.id);

  let writerCost = 0;
  if (mode !== 'custom') {
    const userName = loadRoomConfig(user.id, room).userName;
    const lines = texts.map((item) => ({ name: item.role === 'user' ? item.personaName || userName : byId(item.speakerId)?.name ?? '角色', content: item.content }));
    const previousPrompt = images.filter((item) => item.speakerId === focus.id && item.prompt).pop()?.prompt;
    const written = await writeImagePromptWith(user.id, {
      model: room.model,
      ref: `room:${room.id}`,
      generationChatId: null,
      history: historyText(lines, mode),
      others: cast.filter((item) => item.id !== focus.id),
      othersWithReference: refs.filter((item) => item.character.id !== focus.id).map((item) => item.character.name),
    }, focus, mode, { hint: body.hint, consistency: { hasReference: focusHasRef, previousPrompt } });
    if (!written.ok) { refund(); return fail(written.error, written.status); }
    prompt = written.prompt;
    writerCost = written.cost;
  }

  const generationId = startGeneration(user.id, null, 'image', 'image');
  try {
    const lead = refs.length ? `${referenceLeadMany(refs.map((item) => item.character.name))}\n\n` : '';
    const image = await generateImage(`${lead}${prompt}`, user.id, { references: refs.map((item) => item.ref.buffer) });
    const saved = addRoomMessage(room.id, 'assistant', focus.id, prompt);
    setRoomMessageAttachment(saved.id, {
      kind: 'image', url: image.url, prompt, mode,
      reference: image.usedReference ? refs.map((item) => `${item.character.id}:${item.ref.source}`).join(',') || undefined : undefined,
      width: image.width, height: image.height,
    });
    finishGeneration(generationId, { status: 'done', promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    return Response.json({ message: getRoomMessage(room.id, saved.id), cost: cost + writerCost, balance: balance(user.id), prompt });
  } catch (error) {
    refund();
    finishGeneration(generationId, { status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: true, error: error instanceof Error ? error.message : '生图失败' });
    return fail(error instanceof Error ? error.message : '生图失败', 502);
  }
}

