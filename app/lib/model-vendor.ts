// 按模型 id 猜厂商（模型广场的厂商筛选与图标用）。纯函数，前后端都能用。
export type Vendor = { key: string; name: string; mark: string; color: string };

const VENDORS: { test: RegExp; vendor: Vendor }[] = [
  { test: /claude|anthropic/i, vendor: { key: 'anthropic', name: 'Anthropic', mark: 'A', color: '#d97757' } },
  { test: /gpt|o[1-9](-|$)|openai|chatgpt|dall-?e|whisper|^tts-1|text-embedding-(3|ada)/i, vendor: { key: 'openai', name: 'OpenAI', mark: 'O', color: '#10a37f' } },
  { test: /gemini|gemma|palm|google|imagen/i, vendor: { key: 'google', name: 'Google', mark: 'G', color: '#4285f4' } },
  { test: /deepseek/i, vendor: { key: 'deepseek', name: 'DeepSeek', mark: 'D', color: '#4d6bfe' } },
  { test: /qwen|qwq|tongyi|wanx|wan2|cosyvoice|sambert/i, vendor: { key: 'qwen', name: '通义千问', mark: '通', color: '#615ced' } },
  { test: /glm|zhipu|chatglm|cogview|cogvideo/i, vendor: { key: 'zhipu', name: '智谱', mark: '智', color: '#3859ff' } },
  { test: /kimi|moonshot/i, vendor: { key: 'moonshot', name: 'Moonshot', mark: 'K', color: '#16191e' } },
  { test: /doubao|seed|bytedance|jimeng|即梦/i, vendor: { key: 'doubao', name: '豆包', mark: '豆', color: '#3c8cff' } },
  { test: /grok|xai/i, vendor: { key: 'xai', name: 'xAI', mark: 'X', color: '#111111' } },
  { test: /llama|meta/i, vendor: { key: 'meta', name: 'Meta', mark: 'M', color: '#0668e1' } },
  { test: /mistral|mixtral|codestral/i, vendor: { key: 'mistral', name: 'Mistral', mark: 'M', color: '#fa520f' } },
  { test: /minimax|abab/i, vendor: { key: 'minimax', name: 'MiniMax', mark: 'M', color: '#e3415b' } },
  { test: /yi-|01-ai|lingyi/i, vendor: { key: 'yi', name: '零一万物', mark: '零', color: '#1f6f43' } },
  { test: /hunyuan/i, vendor: { key: 'hunyuan', name: '腾讯混元', mark: '混', color: '#0052d9' } },
  { test: /flux|black-?forest|bfl/i, vendor: { key: 'bfl', name: 'Black Forest Labs', mark: 'F', color: '#1a1a1a' } },
  { test: /stable-?diffusion|sdxl|sd3|stability/i, vendor: { key: 'stability', name: 'Stability AI', mark: 'S', color: '#7c3aed' } },
  { test: /midjourney|mj-/i, vendor: { key: 'midjourney', name: 'Midjourney', mark: 'M', color: '#0b0b0b' } },
  { test: /kolors|kling|kuaishou/i, vendor: { key: 'kuaishou', name: '快手可灵', mark: '可', color: '#ff5a1f' } },
  { test: /ideogram/i, vendor: { key: 'ideogram', name: 'Ideogram', mark: 'I', color: '#222' } },
  { test: /recraft/i, vendor: { key: 'recraft', name: 'Recraft', mark: 'R', color: '#e0402c' } },
  { test: /elevenlabs/i, vendor: { key: 'elevenlabs', name: 'ElevenLabs', mark: 'E', color: '#111' } },
  { test: /fish-?speech|fishaudio/i, vendor: { key: 'fish', name: 'Fish Audio', mark: 'F', color: '#2563eb' } },
  { test: /bge|baai/i, vendor: { key: 'baai', name: '智源 BAAI', mark: '智', color: '#0f766e' } },
  { test: /jina/i, vendor: { key: 'jina', name: 'Jina AI', mark: 'J', color: '#009191' } },
  { test: /voyage/i, vendor: { key: 'voyage', name: 'Voyage AI', mark: 'V', color: '#333' } },
  { test: /cohere|command-r|embed-(english|multilingual)/i, vendor: { key: 'cohere', name: 'Cohere', mark: 'C', color: '#39594d' } },
  { test: /ernie|wenxin/i, vendor: { key: 'baidu', name: '文心', mark: '文', color: '#2932e1' } },
];

const OTHER: Vendor = { key: 'other', name: '其他', mark: '·', color: '#8a8580' };

export function modelVendor(id: string): Vendor {
  return VENDORS.find((item) => item.test.test(id))?.vendor ?? OTHER;
}

/** 从 id 猜对话模型的能力标签（思考、视觉、长上下文…）；类别相关的见 lib/model-kind.ts */
