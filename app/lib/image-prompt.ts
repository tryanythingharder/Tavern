import { finishGeneration, listMessages, startGeneration, type DbCharacter, type DbChat } from '@/lib/db';
import { modelConfigured, modelName, streamChat, type ChatMessage } from '@/lib/model';
import { pointsCost, reservePoints, settleGeneration } from '@/lib/points';
import { dailyFreeRemaining } from '@/lib/growth';
import { estimateTokens } from '@/lib/usage';

// 对话里的「生图」：像 ST 的 /sd 一样，先让对话模型按上下文写画面提示词，再交给生图模型。
// scene = 当前场景；last = 最后一条回复的画面；character = 角色立绘；custom = 玩家自己写
export type ImageMode = 'scene' | 'last' | 'character' | 'custom';
export const IMAGE_MODES: ImageMode[] = ['scene', 'last', 'character', 'custom'];
export const imageModeOf = (value: unknown): ImageMode => (IMAGE_MODES.includes(value as ImageMode) ? (value as ImageMode) : 'scene');

const TARGET: Record<Exclude<ImageMode, 'custom'>, (name: string) => string> = {
  scene: () => 'the current scene as it stands after the latest messages: where they are, who is present, what is happening right now',
  last: () => 'the exact moment described in the last reply',
  character: (name) => `a character portrait of ${name}: face, hair, body type, outfit, expression and pose, with a simple background that fits their world`,
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

type Consistency = { hasReference: boolean; previousPrompt?: string };

function writerPrompt(mode: Exclude<ImageMode, 'custom'>, character: DbCharacter, chat: DbChat, userName: string, hint: string, consistency: Consistency): ChatMessage[] {
  const history = listMessages(chat.id)
    .filter((message) => !message.attachment && message.role !== 'system' && message.content.trim())
    .slice(mode === 'character' ? -2 : -8)
    .map((message) => `${message.role === 'user' ? message.persona_name || userName : character.name}: ${clip(message.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(), 700)}`)
    .join('\n\n');
  return [
    {
      role: 'system',
      content: [
        'You write prompts for an image generation model.',
        `Read the role-play below and write ONE English prompt for ${TARGET[mode](character.name)}.`,
        'Describe concrete visual details: appearance, clothing, setting, time of day, lighting, mood, colour palette, camera framing and art style that suits the story.',
        'Use comma-separated descriptive phrases, at most 90 words. No dialogue, no speech bubbles, no text in the image, keep it non-explicit.',
        // 人物一致性：有参考图时脸交给参考图，别用文字重新捏一张脸；没有参考图时沿用上一张图的外貌写法
        consistency.hasReference
          ? `A reference image of ${character.name} is given to the image model. Call ${character.name} "the person from the reference image" and do not re-describe their face, hair or age; describe only outfit, expression, pose and everything else.`
          : `Keep ${character.name}'s look stable across pictures: state their apparent age, hair, eyes and build the same way every time.${consistency.previousPrompt ? ' Reuse the appearance wording of the previous illustration prompt exactly.' : ''}`,
        'Output only the prompt, nothing else.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Character: ${character.name}`,
        `Character description:\n${clip(character.description || character.hook || '', 1500)}`,
        history ? `Recent role-play:\n${history}` : '',
        !consistency.hasReference && consistency.previousPrompt ? `Previous illustration prompt (keep ${character.name}'s appearance identical):\n${clip(consistency.previousPrompt, 700)}` : '',
        hint ? `Extra request from the player: ${hint}` : '',
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

export type ImagePromptResult = { ok: true; prompt: string; cost: number } | { ok: false; error: string; status: number };

export async function writeImagePrompt(userId: number, chat: DbChat, character: DbCharacter, mode: Exclude<ImageMode, 'custom'>, options: { userName: string; hint?: string; consistency?: Consistency }): Promise<ImagePromptResult> {
  if (!modelConfigured()) return { ok: false, error: '对话模型未配置，没法自动写画面描述', status: 503 };
  const prompt = writerPrompt(mode, character, chat, options.userName, (options.hint ?? '').trim().slice(0, 200), options.consistency ?? { hasReference: false });
  const model = modelName(chat.model);
  const promptTokens = prompt.reduce((sum, item) => sum + estimateTokens(item.content) + 4, 0);
  const maxTokens = 400;
  const ref = `chat:${chat.id}`;
  const reservation = reservePoints(userId, Math.max(0, pointsCost(promptTokens, maxTokens, model) - dailyFreeRemaining(userId)), `生图描述 · ${model}`, ref);
  if (!reservation.ok) return { ok: false, error: '点数不足，没法写画面描述', status: 402 };

  const generationId = startGeneration(userId, chat.id, 'image-prompt', model);
  let full = '';
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null;
  let billed = model;
  try {
    for await (const event of streamChat(prompt, {
      model: chat.model,
      params: { maxTokens, temperature: 0.7, topP: 1, topK: 0, minP: 0, typicalP: 1, repetitionPenalty: 1, repetitionPenaltyRange: 0, repetitionPenaltySlope: 1, presencePenalty: 0, frequencyPenalty: 0, contextSize: 0, seed: -1 },
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
    return { ok: false, error: `画面描述没写出来：${message.slice(0, 160)}`, status: 502 };
  }
  const completionTokens = usage?.completionTokens ?? estimateTokens(full);
  const result = full.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*(prompt\s*:)?\s*["“]?|["”]?\s*$/gi, '').trim().slice(0, 900);
  const cost = pointsCost(usage?.promptTokens ?? promptTokens, completionTokens, billed);
  finishGeneration(generationId, { model: billed, status: result ? 'done' : 'error', promptTokens: usage?.promptTokens ?? promptTokens, completionTokens, totalTokens: usage?.totalTokens, estimated: !usage, error: result ? undefined : 'empty' });
  const settled = settleGeneration(userId, reservation.reserved, result ? cost : 0, ref);
  if (!result) return { ok: false, error: '模型没写出画面描述，换个方式再试', status: 502 };
  return { ok: true, prompt: result, cost: settled.cost };
}
