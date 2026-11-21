// 按模型 id 猜厂商（模型广场的厂商筛选与图标用）。纯函数，前后端都能用。
export type Vendor = { key: string; name: string; mark: string; color: string };

const VENDORS: { test: RegExp; vendor: Vendor }[] = [
  { test: /claude|anthropic/i, vendor: { key: 'anthropic', name: 'Anthropic', mark: 'A', color: '#d97757' } },
  { test: /gpt|o[1-9](-|$)|openai|chatgpt|dall-?e|whisper/i, vendor: { key: 'openai', name: 'OpenAI', mark: 'O', color: '#10a37f' } },
  { test: /gemini|gemma|palm|google/i, vendor: { key: 'google', name: 'Google', mark: 'G', color: '#4285f4' } },
  { test: /deepseek/i, vendor: { key: 'deepseek', name: 'DeepSeek', mark: 'D', color: '#4d6bfe' } },
  { test: /qwen|qwq|tongyi/i, vendor: { key: 'qwen', name: '通义千问', mark: '通', color: '#615ced' } },
  { test: /glm|zhipu|chatglm/i, vendor: { key: 'zhipu', name: '智谱', mark: '智', color: '#3859ff' } },
  { test: /kimi|moonshot/i, vendor: { key: 'moonshot', name: 'Moonshot', mark: 'K', color: '#16191e' } },
  { test: /doubao|seed|bytedance/i, vendor: { key: 'doubao', name: '豆包', mark: '豆', color: '#3c8cff' } },
  { test: /grok|xai/i, vendor: { key: 'xai', name: 'xAI', mark: 'X', color: '#111111' } },
  { test: /llama|meta/i, vendor: { key: 'meta', name: 'Meta', mark: 'M', color: '#0668e1' } },
  { test: /mistral|mixtral|codestral/i, vendor: { key: 'mistral', name: 'Mistral', mark: 'M', color: '#fa520f' } },
  { test: /minimax|abab/i, vendor: { key: 'minimax', name: 'MiniMax', mark: 'M', color: '#e3415b' } },
  { test: /yi-|01-ai|lingyi/i, vendor: { key: 'yi', name: '零一万物', mark: '零', color: '#1f6f43' } },
  { test: /hunyuan/i, vendor: { key: 'hunyuan', name: '腾讯混元', mark: '混', color: '#0052d9' } },
  { test: /ernie|wenxin/i, vendor: { key: 'baidu', name: '文心', mark: '文', color: '#2932e1' } },
];

const OTHER: Vendor = { key: 'other', name: '其他', mark: '·', color: '#8a8580' };

export function modelVendor(id: string): Vendor {
  return VENDORS.find((item) => item.test.test(id))?.vendor ?? OTHER;
}

/** 从 id 猜能力标签：思考、视觉、长上下文 */
export function modelTraits(id: string, contextTokens: number): string[] {
  const out: string[] = [];
  if (/r1|reason|think|o[1-9](-|$)|qwq/i.test(id)) out.push('深度思考');
  if (/vision|vl\b|-vl|4o|gemini|claude-3|claude-sonnet|claude-opus/i.test(id)) out.push('识图');
  if (contextTokens >= 128_000) out.push('长上下文');
  return out;
}
