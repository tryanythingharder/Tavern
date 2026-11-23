// 模型类别与能力（模型广场的「模型类别 / 模型能力」筛选用）。纯函数，前后端都能用。
export type ModelKind = 'chat' | 'image' | 'tts' | 'embedding';

export const KIND_LABEL: Record<ModelKind, string> = { chat: '对话', image: '生图', tts: '语音', embedding: '向量' };
export const KIND_USE: Record<ModelKind, string> = {
  chat: '角色对话、群聊、总结',
  image: '对话里的「生图」按钮',
  tts: '消息朗读',
  embedding: '长期记忆与资料库检索',
};

const IMAGE = /dall-?e|gpt-image|image-|-image|imagen|flux|stable-?diffusion|sdxl|sd3|\bsd-|midjourney|mj-|kolors|cogview|seedream|seededit|wanx|wan2|hidream|ideogram|recraft|playground-v|jimeng|即梦/i;
const TTS = /^tts-|-tts|tts$|speech|cosyvoice|fish-?speech|elevenlabs|voice|sambert|gpt-4o-mini-tts/i;
const EMBED = /embed|bge-|\bbge\b|e5-|gte-|jina-|voyage|m3e|text2vec/i;

/** 按 id 猜类别；后台在别处明确配置的（生图/TTS/向量模型）以配置为准 */
export function guessKind(id: string): ModelKind {
  if (EMBED.test(id)) return 'embedding';
  if (TTS.test(id) && !/omni|realtime|audio-preview/i.test(id)) return 'tts';
  if (IMAGE.test(id) && !/vision|vl\b|-vl/i.test(id)) return 'image';
  return 'chat';
}

/** 能力标签：对话模型按 id 与上下文猜；其它类别给固定能力 */
export function kindCapabilities(kind: ModelKind, id: string, contextTokens: number): string[] {
  if (kind === 'image') {
    const out = ['文生图'];
    if (/edit|kontext|seededit|gpt-image|img2img|i2i/i.test(id)) out.push('图片编辑');
    return out;
  }
  if (kind === 'tts') return ['语音合成'];
  if (kind === 'embedding') return ['文本向量'];
  const out: string[] = [];
  if (/r1|reason|think|o[1-9](-|$)|qwq/i.test(id)) out.push('深度思考');
  if (/vision|vl\b|-vl|4o|gemini|claude-3|claude-sonnet|claude-opus|gpt-4\.1|gpt-5/i.test(id)) out.push('识图');
  if (contextTokens >= 128_000) out.push('长上下文');
  if (/flash|mini|lite|turbo|haiku|nano|small|instant/i.test(id)) out.push('快速');
  if (/coder|code/i.test(id)) out.push('代码');
  return out;
}
