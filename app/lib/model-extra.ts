import { embedConfig } from '@/lib/vectors';
import { imageConfig, ttsConfig } from '@/lib/media';
import type { ModelKind } from '@/lib/model-kind';

// 后台单独配置的非对话模型（生图 / 语音 / 向量）：不在对话渠道里，但模型广场要能看到。
export type ExtraModel = { id: string; kind: Exclude<ModelKind, 'chat'>; cost: number; source: string };

export function configuredExtraModels(): ExtraModel[] {
  const out: ExtraModel[] = [];
  const image = imageConfig();
  if (image.baseUrl && image.apiKey && image.model) out.push({ id: image.model, kind: 'image', cost: image.cost, source: '生图配置' });
  const tts = ttsConfig();
  if (tts.baseUrl && tts.apiKey && tts.model) out.push({ id: tts.model, kind: 'tts', cost: tts.cost, source: '语音配置' });
  const embed = embedConfig();
  if (embed) out.push({ id: embed.model, kind: 'embedding', cost: 0, source: '向量配置' });
  return out;
}
