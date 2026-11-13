import { canGenerate, getCurrentUser } from '@/lib/auth';
import { finishGeneration, getMessage, getOwnedMessage, setMessageAttachment, startGeneration } from '@/lib/db';
import { toMessageView } from '@/lib/chat-view';
import { generateSpeech, ttsConfigured, ttsCost } from '@/lib/media';
import { grantPoints, reservePoints } from '@/lib/points';
import { checkQuota } from '@/lib/usage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/messages/[id]/tts —— 把一条角色消息合成语音，作为附件挂回这条消息
export async function POST(_request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再生成', 403);
  const message = getOwnedMessage(Number((await context.params).id), user.id);
  if (!message) return fail('消息不存在', 404);
  if (message.role !== 'assistant') return fail('只有角色消息可以朗读', 400);
  if (!message.content.trim()) return fail('这条消息没有内容', 400);
  if (!ttsConfigured()) return fail('语音未配置：请设置 TAVERN_TTS_* 环境变量', 503);

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429);
  const cost = ttsCost();
  const reservation = reservePoints(user.id, cost, '语音合成', `message:${message.id}`);
  if (!reservation.ok) return fail(`点数不足（语音需要 ${cost} 点）`, 402);

  const generationId = startGeneration(user.id, message.chat_id, 'tts', 'tts');
  try {
    const speech = await generateSpeech(message.content, user.id);
    setMessageAttachment(message.id, JSON.stringify({ kind: 'audio', url: speech.url, createdAt: Date.now() }));
    finishGeneration(generationId, { status: 'done', promptTokens: 0, completionTokens: 0, totalTokens: 0 });
    const updated = getMessage(message.id)!;
    return Response.json({ message: toMessageView(updated), cost });
  } catch (error) {
    if (reservation.reserved > 0) grantPoints(user.id, reservation.reserved, '语音失败退回', 'adjust');
    finishGeneration(generationId, { status: 'error', promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: true, error: error instanceof Error ? error.message : '语音合成失败' });
    return fail(error instanceof Error ? error.message : '语音合成失败', 502);
  }
}
