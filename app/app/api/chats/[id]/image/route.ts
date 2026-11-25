import { canGenerate, getCurrentUser } from '@/lib/auth';
import { addMessage, finishGeneration, getCharacterById, getChat, getMessage, setMessageAttachment, startGeneration } from '@/lib/db';
import { imageModeOf, writeImagePrompt } from '@/lib/image-prompt';
import { loadGenerationConfig } from '@/lib/resources-db';
import { nsfwBlock } from '@/lib/age-gate';
import { toMessageView } from '@/lib/chat-view';
import { generateImage, imageConfig, imageConfigured, imageCost } from '@/lib/media';
import { characterReference, chatImages, referenceLead } from '@/lib/image-ref';
import { grantPoints, reservePoints } from '@/lib/points';
import { checkQuota } from '@/lib/usage';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/chats/[id]/image —— { mode, hint?, prompt? } 生成一张图，作为一条角色消息的附件
// mode：scene 当前场景 / last 最后一条回复 / character 角色立绘（先由对话模型按上下文写提示词）/ custom 用 prompt 原文
export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const chat = getChat(Number((await context.params).id), user.id);
  if (!chat) return fail('会话不存在', 404);

  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { prompt?: string; mode?: string; hint?: string };
  // 老客户端只传 prompt：当作自己写
  const mode = body.mode ? imageModeOf(body.mode) : body.prompt ? 'custom' : 'scene';
  let prompt = String(body.prompt ?? '').trim().slice(0, 900);
  if (mode === 'custom' && !prompt) return fail('请写一句画面描述', 400);
  if (!imageConfigured()) return fail('生图还没开通：请管理员在后台「接口配置 · 生图」里填好', 503);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  const cost = imageCost();
  const reservation = reservePoints(user.id, cost, '生图', `chat:${chat.id}`);
  if (!reservation.ok) return fail(`点数不足（生图需要 ${cost} 点）`, 402);

  let writerCost = 0;
  const character = getCharacterById(chat.character_id);
  // 人物一致性：角色有图就当参考图；立绘模式且对话里还没有立绘时，这一张就是以后的基准
  const reference = character && imageConfig().reference ? await characterReference(character, chatImages(chat.id), user.id) : null;
  if (mode !== 'custom') {
    if (!character) { grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust'); return fail('角色不存在', 404); }
    const blocked18 = await nsfwBlock(user.id, character);
    if (blocked18) { grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust'); return fail(blocked18, 403); }
    const previousPrompt = chatImages(chat.id).filter((item) => item.prompt).pop()?.prompt;
    const written = await writeImagePrompt(user.id, chat, character, mode, { userName: loadGenerationConfig(user.id, chat).userName, hint: body.hint, consistency: { hasReference: Boolean(reference), previousPrompt } });
    if (!written.ok) { if (reservation.reserved > 0) grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust'); return fail(written.error, written.status); }
    prompt = written.prompt;
    writerCost = written.cost;
  }

  const generationId = startGeneration(user.id, chat.id, 'image', 'image');
  try {
    const image = await generateImage(reference && character ? `${referenceLead(character.name)}\n\n${prompt}` : prompt, user.id, { references: reference ? [reference.buffer] : [] });
    const saved = addMessage(chat.id, 'assistant', prompt, [prompt]);
    setMessageAttachment(saved.id, JSON.stringify({ kind: 'image', url: image.url, prompt, mode, reference: image.usedReference ? reference?.source : undefined, width: image.width, height: image.height, createdAt: Date.now() }));
    finishGeneration(generationId, { status: 'done', promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    const updated = getMessage(saved.id)!;
    return Response.json({ message: toMessageView(updated), cost: cost + writerCost, prompt });
  } catch (error) {
    // 生图失败退回预扣；成功时预扣就是最终扣费
    if (reservation.reserved > 0) grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust');
    finishGeneration(generationId, { status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: true, error: error instanceof Error ? error.message : '生图失败' });
    return fail(error instanceof Error ? error.message : '生图失败', 502);
  }
}
