import { canGenerate, getCurrentUser } from '@/lib/auth';
import { addMessage, finishGeneration, getChat, getMessage, setMessageAttachment, startGeneration } from '@/lib/db';
import { toMessageView } from '@/lib/chat-view';
import { generateImage, imageConfigured, imageCost } from '@/lib/media';
import { grantPoints, reservePoints } from '@/lib/points';
import { checkQuota } from '@/lib/usage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/chats/[id]/image —— { prompt } 生成一张图，作为一条角色消息的附件
export async function POST(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const chat = getChat(Number((await context.params).id), user.id);
  if (!chat) return fail('会话不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  const prompt = String(body.prompt ?? '').trim().slice(0, 500);
  if (!prompt) return fail('请写一句画面描述', 400);
  if (!imageConfigured()) return fail('生图未配置：请设置 TAVERN_IMAGE_* 环境变量', 503);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  const cost = imageCost();
  const reservation = reservePoints(user.id, cost, '生图', `chat:${chat.id}`);
  if (!reservation.ok) return fail(`点数不足（生图需要 ${cost} 点）`, 402);

  const generationId = startGeneration(user.id, chat.id, 'image', 'image');
  try {
    const image = await generateImage(prompt, user.id);
    const saved = addMessage(chat.id, 'assistant', prompt, [prompt]);
    setMessageAttachment(saved.id, JSON.stringify({ kind: 'image', url: image.url, prompt, createdAt: Date.now() }));
    finishGeneration(generationId, { status: 'done', promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    const updated = getMessage(saved.id)!;
    return Response.json({ message: toMessageView(updated), cost });
  } catch (error) {
    // 生图失败退回预扣；成功时预扣就是最终扣费
    if (reservation.reserved > 0) grantPoints(user.id, reservation.reserved, '生图失败退回', 'adjust');
    finishGeneration(generationId, { status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: true, error: error instanceof Error ? error.message : '生图失败' });
    return fail(error instanceof Error ? error.message : '生图失败', 502);
  }
}
