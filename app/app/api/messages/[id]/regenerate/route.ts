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
import { assemblePrompt, applyRegex } from '@/lib/prompt';
import { modelConfigured, modelName, streamChat } from '@/lib/model';
import { checkQuota, estimateTokens } from '@/lib/usage';
import { loadGenerationConfig } from '@/lib/resources-db';
import { memorySettings, ragChunks, snapshotChat, summaryState } from '@/lib/memory';
import { getOverride } from '@/lib/cards';
import { ensureStartingPoints, pointsCost, reservePoints, settleGeneration } from '@/lib/points';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number, retryAfterSeconds?: number) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfterSeconds) headers['Retry-After'] = String(retryAfterSeconds);
  return new Response(JSON.stringify({ message }), { status, headers });
}

// POST /api/messages/[id]/regenerate
// 重新生成一条角色消息：把新结果作为新候选追加，旧候选保留，可来回切换。
// 上下文只取这条消息之前的消息，不包含它自己。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const quota = checkQuota(user.id);
  if (!quota.ok) return fail(quota.message, 429, quota.retryAfterSeconds);
  ensureStartingPoints(user.id);
  if (!modelConfigured()) return fail('模型未配置：请在 .env.local 设置三个 TAVERN_MODEL_* 变量', 500);

  const config = loadGenerationConfig(user.id, chat);
  const history = listMessagesBefore(chat.id, message.id);
  const memory = memorySettings(chat);
  const lastUser = [...history].reverse().find((item) => item.role === 'user');
  const rag = memory.ragPrefs.enabled && lastUser ? ragChunks(history, lastUser.content, memory.ragPrefs.topK) : [];
  const prompt = assemblePrompt({
    character,
    history,
    preset: config.preset,
    persona: config.persona,
    loreEntries: config.loreEntries,
    regexRules: config.regexRules,
    trigger: 'regenerate',
    summary: summaryState(chat).text,
    rag,
    memory: memory.memory,
    card: getOverride(user.id, chat.character_id),
  });
  const maxCost = pointsCost(prompt.tokens + prompt.params.maxTokens);
  const reservation = reservePoints(user.id, maxCost, '重新生成', `chat:${chat.id}`);
  if (!reservation.ok) return fail(`点数不足（本次最多需要 ${maxCost} 点），请先签到或充值`, 402);
  const generationId = startGeneration(user.id, chat.id, 'regenerate', modelName());
  const encoder = new TextEncoder();

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
      try {
        for await (const event of streamChat(prompt.messages, { signal: request.signal, params: prompt.params, stop: prompt.stop })) {
          if (event.type === 'content') {
            full += event.text;
            send({ type: 'delta', text: event.text });
          } else if (event.type === 'usage') {
            usage = event;
          }
        }
        const promptTokens = usage?.promptTokens ?? prompt.tokens;
        const completionTokens = usage?.completionTokens ?? estimateTokens(full);
        const totalTokens = usage?.totalTokens ?? promptTokens + completionTokens;
        finishGeneration(generationId, { status: 'done', promptTokens, completionTokens, totalTokens, estimated: !usage });
        const settlement = settleGeneration(user.id, reservation.reserved, pointsCost(totalTokens), `chat:${chat.id}`);
        settled = true;
        const finalText = applyRegex(config.regexRules, full, { target: 'assistant', purpose: 'display', depth: 0 });
        if (finalText.trim()) {
          const candidate = appendCandidate(message.id, finalText);
          snapshotChat(chat.id, user.id);
          send({
            type: 'done',
            messageId: message.id,
            content: finalText,
            candidateIndex: candidate?.index ?? 0,
            candidateCount: candidate?.count ?? 1,
            cost: settlement.cost,
            balance: settlement.balance,
          });
        } else {
          send({ type: 'error', message: '模型没有返回内容，请重试' });
        }
      } catch (error) {
        // 中断时保留已生成的部分，作为候选存下来
        const partial = applyRegex(config.regexRules, full, { target: 'assistant', purpose: 'display', depth: 0 });
        if (partial.trim()) appendCandidate(message.id, partial);
        const aborted = (error as Error)?.name === 'AbortError' || request.signal.aborted;
        finishGeneration(generationId, {
          status: aborted ? 'aborted' : 'error',
          promptTokens: prompt.tokens,
          completionTokens: estimateTokens(full),
          estimated: true,
          error: aborted ? null : error instanceof Error ? error.message : String(error),
        });
        if (!settled) {
          settleGeneration(user.id, reservation.reserved, pointsCost(prompt.tokens + estimateTokens(full)), `chat:${chat.id}`);
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
