import db, { finishGeneration, startGeneration, type DbMessage } from '@/lib/db';
import { modelConfigured, modelName, streamChat, type ChatMessage } from '@/lib/model';
import { pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';
import { estimateTokens } from '@/lib/usage';
import { TRANSLATE_LANGS, withTranslation, translationFor, type TranslationView } from '@/lib/translation';

// 消息翻译（对齐 ST Translate 扩展）。ST 调外部翻译服务；我们用站内模型翻译（会话当前模型），
// 好处是 RP 文本里的语气、称呼、动作描写、HTML/Markdown 都能保住。按模型价格扣点，账本备注「翻译」。
// 译文按正文哈希存在 messages.translations，模型看到的始终是正文（除非玩家开了「翻译输入」）。

const MAX_INPUT = 12_000;

function promptFor(text: string, lang: string): ChatMessage[] {
  const target = TRANSLATE_LANGS.find((item) => item.code === lang)?.prompt ?? lang;
  return [
    {
      role: 'system',
      content: `You are a professional literary translator for role-play fiction. Translate the user's text into ${target}.
Rules:
- Output ONLY the translation, no notes, no quotes around it.
- Keep the tone, honorifics, names and the speaker's voice.
- Keep every Markdown mark (*, **, _, >, lists), HTML tags and attributes, code blocks, {{macros}}, <tags>, URLs and emoji exactly as they are; translate only human-readable text.
- Keep line breaks and paragraph structure.
- If the text is already in ${target}, return it unchanged.`,
    },
    { role: 'user', content: text },
  ];
}

export type TranslateResult = { ok: true; text: string; cost: number; free: number; balance: number } | { ok: false; error: string; status: number };

export async function translateText(userId: number, text: string, lang: string, options: { model?: string | null; ref?: string } = {}): Promise<TranslateResult> {
  const source = text.trim();
  if (!source) return { ok: false, error: '没有可翻译的内容', status: 400 };
  if (source.length > MAX_INPUT) return { ok: false, error: `内容太长（超过 ${MAX_INPUT} 字），请分段翻译`, status: 400 };
  if (!TRANSLATE_LANGS.some((item) => item.code === lang)) return { ok: false, error: '不支持的目标语言', status: 400 };
  if (!modelConfigured()) return { ok: false, error: '站点还没有可用的模型', status: 503 };

  const prompt = promptFor(source, lang);
  const model = modelName(options.model);
  const promptTokens = prompt.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0);
  const maxTokens = Math.min(8000, Math.max(256, Math.ceil(estimateTokens(source) * 2.2) + 64));
  const ref = options.ref ?? 'translate';
  const reservation = reservePoints(userId, Math.max(0, pointsCost(promptTokens, maxTokens, model) - dailyFreeRemaining(userId)), `翻译 · ${model}`, ref);
  if (!reservation.ok) return { ok: false, error: '点数不足，无法翻译', status: 402 };

  const generationId = startGeneration(userId, null, 'translate', model);
  let full = '';
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  let billed = model;
  try {
    for await (const event of streamChat(prompt, {
      model: options.model,
      params: { maxTokens, temperature: 0.2, topP: 1, topK: 0, minP: 0, typicalP: 1, repetitionPenalty: 1, repetitionPenaltyRange: 0, repetitionPenaltySlope: 1, presencePenalty: 0, frequencyPenalty: 0, contextSize: 0, seed: -1 },
      reasoningTags: { prefix: '<think>', suffix: '</think>' },
    })) {
      if (event.type === 'content') full += event.text;
      else if (event.type === 'usage') usage = event;
      else if (event.type === 'route') billed = event.model;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGeneration(generationId, { model: billed, status: 'error', promptTokens, completionTokens: estimateTokens(full), estimated: true, error: message });
    settleGeneration(userId, reservation.reserved, 0, ref);
    return { ok: false, error: `翻译失败：${message.slice(0, 200)}`, status: 502 };
  }
  const completionTokens = usage?.completionTokens ?? estimateTokens(full);
  const result = full.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!result) {
    finishGeneration(generationId, { model: billed, status: 'error', promptTokens, completionTokens, estimated: !usage, error: 'empty' });
    settleGeneration(userId, reservation.reserved, 0, ref);
    return { ok: false, error: '模型没有返回译文', status: 502 };
  }
  const cost = pointsCost(usage?.promptTokens ?? promptTokens, completionTokens, billed);
  finishGeneration(generationId, { model: billed, status: 'done', promptTokens: usage?.promptTokens ?? promptTokens, completionTokens, totalTokens: usage?.totalTokens, estimated: !usage });
  const settled = settleGeneration(userId, reservation.reserved, cost, ref);
  return { ok: true, text: result, cost: settled.cost, free: settled.free, balance: settled.balance };
}

export function saveTranslation(message: Pick<DbMessage, 'id' | 'content' | 'translations'>, entry: { lang: string; text: string; original?: boolean } | null): TranslationView | null {
  const raw = withTranslation(message.translations, message.content, entry ? { ...entry, at: Date.now() } : null);
  db.prepare('UPDATE messages SET translations = ? WHERE id = ?').run(raw, message.id);
  return translationFor(raw, message.content);
}
