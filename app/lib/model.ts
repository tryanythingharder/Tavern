// 模型调用：OpenAI 兼容的 /chat/completions，流式。
// 端点与密钥优先读后台配置（app_settings），其次环境变量（.env.local，已 gitignore）——绝不写进代码或提交。
import type { PresetParams } from '@/lib/resources';
import { getSetting } from '@/lib/settings';
import { channelCount, channelModels, channelRoutes, channelRoutesFor } from '@/lib/channels';
import { modelPricePer1k } from '@/lib/points';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function baseUrl(): string {
  return getSetting('model.baseUrl', process.env.TAVERN_MODEL_BASE_URL ?? '');
}

function apiKey(): string {
  return getSetting('model.apiKey', process.env.TAVERN_MODEL_API_KEY ?? '');
}

function modelId(): string {
  return getSetting('model.name', process.env.TAVERN_MODEL_NAME ?? '');
}

export type ModelRoute = { baseUrl: string; apiKey: string; model: string };

function parseFallbacks(raw: string): ModelRoute[] {
  if (!raw.trim()) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => ({
        baseUrl: String(item?.baseUrl ?? '').trim().replace(/\/$/, ''),
        apiKey: String(item?.apiKey ?? '').trim(),
        model: String(item?.model ?? '').trim(),
      }))
      .filter((item) => item.baseUrl && item.apiKey && item.model)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// 主线路 + 备用线路；备用线路由后台 JSON 或 TAVERN_MODEL_FALLBACKS 配置。
function routeList(): { primary: ModelRoute; fallbacks: ModelRoute[] } {
  const primary: ModelRoute = { baseUrl: baseUrl().replace(/\/$/, ''), apiKey: apiKey(), model: modelId() };
  const raw = parseFallbacks(getSetting('model.fallbacks', process.env.TAVERN_MODEL_FALLBACKS ?? ''));
  const seen = new Set<string>();
  if (primary.baseUrl && primary.apiKey && primary.model) seen.add(`${primary.baseUrl}|${primary.model}`);
  const fallbacks = raw.filter((route) => {
    const key = `${route.baseUrl}|${route.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { primary, fallbacks };
}

export function modelRoutes(preferred?: string | null): ModelRoute[] {
  const wanted = String(preferred ?? '').trim();
  if (wanted) {
    const picked = channelCount() > 0
      ? channelRoutesFor(wanted)
      : (() => { const { primary, fallbacks } = routeList(); return [primary, ...fallbacks].filter((route) => route.baseUrl && route.apiKey && route.model === wanted); })();
    if (picked.length) return picked;
  }
  // 只要后台建过渠道，文本生成就只走启用的渠道（全部停用即视为未配置）；
  // 没有渠道时沿用单线路 + 备用线路的旧配置，兼容已有部署。
  const channels = channelRoutes();
  if (channels.length) return channels;
  if (channelCount() > 0) return [];
  const { primary, fallbacks } = routeList();
  return [primary, ...fallbacks].filter((route) => Boolean(route.baseUrl && route.apiKey && route.model));
}

// 已生效的备用线路（去掉与主线路重复的、缺字段的），后台状态用。
export function modelFallbacks(): ModelRoute[] {
  return routeList().fallbacks;
}

export function modelConfigured(): boolean {
  return modelRoutes().length > 0;
}

export function modelName(preferred?: string | null): string {
  return modelRoutes(preferred)[0]?.model ?? modelId();
}

// 玩家在对话里能选的模型（后台渠道启用的全部模型；没建渠道时用主线路 + 备用线路）。
export type ModelOption = { id: string; source: string; isDefault: boolean; price: number };
export function availableModels(): ModelOption[] {
  if (channelCount() > 0) {
    const list = channelModels();
    const fallback = modelRoutes()[0]?.model;
    return list.map((item) => ({ id: item.id, source: item.channels.join(' / '), isDefault: item.id === fallback, price: modelPricePer1k(item.id) }));
  }
  const { primary, fallbacks } = routeList();
  const seen = new Set<string>();
  return [primary, ...fallbacks]
    .filter((route) => route.baseUrl && route.apiKey && route.model && !seen.has(route.model) && Boolean(seen.add(route.model)))
    .map((route, index) => ({ id: route.model, source: index === 0 ? '主线路' : '备用线路', isDefault: index === 0, price: modelPricePer1k(route.model) }));
}

export function modelBaseUrl(): string {
  return baseUrl();
}

// 后台「测试」：直接打指定渠道，不走 failover，避免测到别的线路上。
export async function testModelRoute(route: ModelRoute): Promise<{ text: string; ms: number }> {
  const started = Date.now();
  const timeoutMs = Math.max(5000, Number(process.env.TAVERN_UPSTREAM_TIMEOUT_MS ?? 120_000));
  let response: Response;
  try {
    response = await fetch(`${route.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` },
      body: JSON.stringify({
        model: route.model,
        messages: [{ role: 'user', content: '只回复两个字母：ok' }],
        max_tokens: 16,
        temperature: 0.5,
        stream: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`无法连接上游：${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`上游返回 ${response.status}${text ? `：${text.slice(0, 160)}` : ''}`);
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? '';
    return { text: String(content).trim().slice(0, 80), ms: Date.now() - started };
  } catch {
    throw new Error('上游返回的不是 JSON');
  }
}

export type StreamEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'content'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number }
  // 实际接通的线路模型（failover 后可能不是选中的那个），计费以它为准
  | { type: 'route'; model: string };

export type StreamOptions = {
  signal?: AbortSignal;
  params?: PresetParams;
  stop?: string[];
  model?: string | null;
};

// 逐块产出：reasoning_content（模型的思考）与 content（正文）分开，UI 只展示正文。
// stream_options.include_usage 让网关在最后一个分片带 usage（实测 cjms.cc 支持）；不支持时会走估算兜底。
export async function* streamChat(messages: ChatMessage[], options: StreamOptions = {}): AsyncGenerator<StreamEvent> {
  if (!modelConfigured()) throw new Error('模型未配置：请在后台「模型与网关」或 .env.local 配置');
  const params = options.params;
  const body: Record<string, unknown> = {
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: params?.maxTokens ?? 900,
    temperature: params?.temperature ?? 0.9,
    top_p: params?.topP ?? 0.95,
  };
  // 只下发与默认值不同的采样参数，减少网关不认识的字段
  if (params) {
    if (params.topK > 0) body.top_k = params.topK;
    if (params.minP > 0) body.min_p = params.minP;
    if (params.typicalP !== 1) body.typical_p = params.typicalP;
    if (params.repetitionPenalty !== 1) body.repetition_penalty = params.repetitionPenalty;
    if (params.presencePenalty !== 0) body.presence_penalty = params.presencePenalty;
    if (params.frequencyPenalty !== 0) body.frequency_penalty = params.frequencyPenalty;
    if (params.seed >= 0) body.seed = params.seed;
  }
  if (options.stop?.length) body.stop = options.stop;

  // 上游必须有超时；否则一个挂起的网关会一直占着连接和内存。
  const timeoutMs = Math.max(1000, Number(process.env.TAVERN_UPSTREAM_TIMEOUT_MS ?? 120_000));
  const routes = modelRoutes(options.model);
  if (!routes.length) throw new Error('模型未配置：请在后台「模型与网关」或 .env.local 配置');

  const request = (route: ModelRoute) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    return fetch(`${route.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${route.apiKey}` },
      body: JSON.stringify({ ...body, model: route.model }),
      signal,
    });
  };

  // 先主线路，再按顺序尝试备用线路；只在还没开始流式输出时切换，不会重复扣用户费用。
  let response: Response | null = null;
  let usedModel = '';
  let lastError = '';
  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const route = routes[routeIndex];
    const attempts = routes.length === 1 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const candidate = await request(route);
        if (candidate.ok && candidate.body) {
          response = candidate;
          usedModel = route.model;
          break;
        }
        const detail = await candidate.text().catch(() => '');
        lastError = `${route.model} 返回 ${candidate.status}${detail ? `：${detail.slice(0, 160)}` : ''}`;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        lastError = `${route.model}：${error instanceof Error ? error.message : String(error)}`;
      }
      if (options.signal?.aborted) throw new Error('生成已中断');
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    if (response) break;
    if (routeIndex < routes.length - 1) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!response?.ok || !response.body) {
    throw new Error(`模型线路均不可用${lastError ? `：${lastError}` : ''}`);
  }
  yield { type: 'route', model: usedModel };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          if (delta.reasoning_content) yield { type: 'reasoning', text: String(delta.reasoning_content) };
          if (delta.content) yield { type: 'content', text: String(delta.content) };
        }
        if (json.usage) {
          const promptTokens = Number(json.usage.prompt_tokens ?? 0);
          const completionTokens = Number(json.usage.completion_tokens ?? 0);
          const totalTokens = Number(json.usage.total_tokens ?? promptTokens + completionTokens);
          if (promptTokens || completionTokens) yield { type: 'usage', promptTokens, completionTokens, totalTokens };
        }
      } catch {
        // 单个分片解析失败不打断整条流
      }
    }
  }
}
