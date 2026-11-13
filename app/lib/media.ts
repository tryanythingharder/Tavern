import { getSetting } from '@/lib/settings';
import { saveMedia } from '@/lib/storage';

// 上游必须有超时和体积上限，避免网关挂起或返回超大文件拖垮进程。
const UPSTREAM_TIMEOUT_MS = Math.max(5000, Number(process.env.TAVERN_MEDIA_TIMEOUT_MS ?? 180_000));
const MAX_MEDIA_BYTES = Math.max(1, Number(process.env.TAVERN_MAX_MEDIA_MB ?? 20)) * 1024 * 1024;

// M4 生图 / TTS：走 OpenAI 兼容接口。配置优先读后台管理页（app_settings），其次环境变量。
// 供应商没配置时接口返回 503，界面按钮也按配置隐藏。
export type ImageConfig = { baseUrl: string; apiKey: string; model: string; size: string; cost: number };
export type TtsConfig = { baseUrl: string; apiKey: string; model: string; voice: string; cost: number };

export function imageConfig(): ImageConfig {
  return {
    baseUrl: getSetting('image.baseUrl', process.env.TAVERN_IMAGE_BASE_URL ?? ''),
    apiKey: getSetting('image.apiKey', process.env.TAVERN_IMAGE_API_KEY ?? process.env.TAVERN_MODEL_API_KEY ?? ''),
    model: getSetting('image.model', process.env.TAVERN_IMAGE_MODEL ?? ''),
    size: getSetting('image.size', process.env.TAVERN_IMAGE_SIZE ?? '1024x1024'),
    cost: Math.max(0, Number(getSetting('points.image', process.env.TAVERN_POINTS_IMAGE ?? '20'))),
  };
}

export function ttsConfig(): TtsConfig {
  return {
    baseUrl: getSetting('tts.baseUrl', process.env.TAVERN_TTS_BASE_URL ?? ''),
    apiKey: getSetting('tts.apiKey', process.env.TAVERN_TTS_API_KEY ?? process.env.TAVERN_MODEL_API_KEY ?? ''),
    model: getSetting('tts.model', process.env.TAVERN_TTS_MODEL ?? ''),
    voice: getSetting('tts.voice', process.env.TAVERN_TTS_VOICE ?? 'alloy'),
    cost: Math.max(0, Number(getSetting('points.tts', process.env.TAVERN_POINTS_TTS ?? '5'))),
  };
}

export const imageCost = () => imageConfig().cost;
export const ttsCost = () => ttsConfig().cost;

export function imageConfigured(): boolean {
  const config = imageConfig();
  return Boolean(config.baseUrl && config.apiKey && config.model);
}

export function ttsConfigured(): boolean {
  const config = ttsConfig();
  return Boolean(config.baseUrl && config.apiKey && config.model);
}

export async function generateImage(prompt: string, ownerId: number): Promise<{ url: string; prompt: string }> {
  const config = imageConfig();
  if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('生图未配置：请到后台「接口配置」填写');
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, prompt, n: 1, size: config.size, response_format: 'b64_json' }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`生图失败（${response.status}）：${detail.slice(0, 160)}`);
  }
  const json = (await response.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  let buffer: Buffer;
  if (item?.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item?.url) {
    const remote = await fetch(item.url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    if (!remote.ok) throw new Error('生图返回的图片地址无法下载');
    buffer = Buffer.from(await remote.arrayBuffer());
  } else {
    throw new Error('生图返回里没有图片数据');
  }
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('生图返回的图片太大');
  return { url: saveMedia(buffer, 'png', { ownerId, visibility: 'private' }), prompt };
}

export async function generateSpeech(text: string, ownerId: number): Promise<{ url: string }> {
  const config = ttsConfig();
  if (!config.baseUrl || !config.apiKey || !config.model) throw new Error('语音未配置：请到后台「接口配置」填写');
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, input: text.slice(0, 2000), voice: config.voice, response_format: 'mp3' }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`语音合成失败（${response.status}）：${detail.slice(0, 160)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MEDIA_BYTES) throw new Error('语音返回的文件太大');
  return { url: saveMedia(buffer, 'mp3', { ownerId, visibility: 'private' }) };
}
