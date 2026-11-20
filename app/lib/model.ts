// 模型调用：OpenAI 兼容的 /chat/completions，流式。
// 端点与密钥优先读后台配置（app_settings），其次环境变量（.env.local，已 gitignore）——绝不写进代码或提交。
import type { PresetParams } from '@/lib/resources';
import { getSetting } from '@/lib/settings';
import { channelCount, channelModels, channelRoutes, channelRoutesFor } from '@/lib/channels';
import { priceLabel, priceRule, priceShort, type PriceRule } from '@/lib/points';
import { isModelHidden, modelCatalogMeta, type ModelMeta } from '@/lib/model-catalog';

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
  // 后台下架的模型：老会话里存着也不再走它，回落默认线路
  if (wanted && !isModelHidden(wanted)) {
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
export type ModelOption = { id: string; source: string; isDefault: boolean; price: number; mode: PriceRule['mode']; priceLabel: string; priceShort: string; name?: string; summary?: string };
const pricing = (id: string) => { const rule = priceRule(id); return { price: rule.price, mode: rule.mode, priceLabel: priceLabel(rule), priceShort: priceShort(rule) }; };
// 玩家可选的模型：去掉后台下架的
export function availableModels(): ModelOption[] {
  const meta = modelCatalogMeta();
  return allModels().filter((item) => !meta[item.id]?.hidden).map((item) => ({ ...item, name: meta[item.id]?.name || undefined, summary: meta[item.id]?.summary || undefined }));
}

// 模型广场：带展示信息；推荐的在前，其次按排序值、价格
export type CatalogModel = ModelOption & { meta: ModelMeta };
export function modelCatalog(options: { includeHidden?: boolean } = {}): CatalogModel[] {
  const meta = modelCatalogMeta();
  return allModels()
    .map((item) => ({ ...item, meta: meta[item.id] ?? { name: '', summary: '', tags: [], context: '', featured: false, hidden: false, sort: 0 } }))
    .filter((item) => options.includeHidden || !item.meta.hidden)
    .sort((a, b) => Number(b.meta.featured) - Number(a.meta.featured) || a.meta.sort - b.meta.sort || a.mode.localeCompare(b.mode) || a.price - b.price || a.id.localeCompare(b.id));
}

function allModels(): ModelOption[] {
  if (channelCount() > 0) {
    const list = channelModels();
    const fallback = modelRoutes()[0]?.model;
    return list.map((item) => ({ id: item.id, source: item.channels.join(' / '), isDefault: item.id === fallback, ...pricing(item.id) }));
  }
  const { primary, fallbacks } = routeList();
  const seen = new Set<string>();
  return [primary, ...fallbacks]
    .filter((route) => route.baseUrl && route.apiKey && route.model && !seen.has(route.model) && Boolean(seen.add(route.model)))
    .map((route, index) => ({ id: route.model, source: index === 0 ? '主线路' : '备用线路', isDefault: index === 0, ...pricing(route.model) }));
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
  | { type: 'route'; model: string }
  // 结束原因：stop / length（被 max_tokens 截断）/ content_filter / stop_string（命中停止词，本地截断）
  | { type: 'finish'; reason: string };

export type StreamOptions = {
  signal?: AbortSignal;
  params?: PresetParams;
  stop?: string[];
  model?: string | null;
  // ST「自动解析」：正文以前缀（<think>）开头时，前缀到后缀之间当作思考内容
  reasoningTags?: { prefix: string; suffix: string } | null;
};

// 上游可重试的状态：限流、超时、网关故障（含 Cloudflare 52x、Anthropic 529 过载）
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529]);
// OpenAI 官方等网关不认识的采样字段会直接 400；遇到就去掉这些字段重试一次（ST 也只按来源下发）
const EXTRA_PARAMS = ['top_k', 'min_p', 'typical_p', 'repetition_penalty', 'seed', 'presence_penalty', 'frequency_penalty'];
// OpenAI 兼容接口最多接受 4 个停止词，多的只在本地截断
const MAX_API_STOPS = 4;

export class UpstreamError extends Error {
  constructor(message: string, readonly code: 'empty' | 'upstream' | 'timeout' | 'unavailable' = 'upstream') {
    super(message);
    this.name = 'UpstreamError';
  }
}

function envMs(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Math.max(min, Number.isFinite(value) ? value : fallback);
}

function retryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.min(3000, Math.max(0, seconds * 1000));
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.min(3000, Math.max(0, at - Date.now())) : 0;
}

function upstreamMessage(detail: string): string {
  try {
    const json = JSON.parse(detail);
    const message = json?.error?.message ?? json?.message ?? json?.error;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 200);
  } catch {
    // 不是 JSON
  }
  return detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// 停止词本地截断：网关忽略 stop 或停止词超过 4 个时，流里出现停止词就在那里截断，后面的不再输出。
// 末尾留一段可能是停止词开头的文字先不发，确认不是再放出去。
export class StopTrimmer {
  private held = '';
  private readonly stops: string[];
  private readonly keep: number;
  stopped = false;
  constructor(stops: string[] = []) {
    this.stops = stops.filter((item) => item.length > 0);
    this.keep = this.stops.reduce((max, item) => Math.max(max, item.length - 1), 0);
  }
  push(text: string): string {
    if (this.stopped) return '';
    if (!this.stops.length) return text;
    this.held += text;
    let cut = -1;
    for (const stop of this.stops) {
      const at = this.held.indexOf(stop);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
    if (cut >= 0) {
      this.stopped = true;
      const out = this.held.slice(0, cut);
      this.held = '';
      return out;
    }
    // 只扣住末尾确实可能是某个停止词前缀的部分
    let hold = 0;
    for (let size = Math.min(this.keep, this.held.length); size > 0; size -= 1) {
      const tail = this.held.slice(-size);
      if (this.stops.some((stop) => stop.startsWith(tail))) { hold = size; break; }
    }
    const out = this.held.slice(0, this.held.length - hold);
    this.held = this.held.slice(this.held.length - hold);
    return out;
  }
  flush(): string {
    const out = this.stopped ? '' : this.held;
    this.held = '';
    return out;
  }
}

// 把正文开头的 <think>…</think> 拆成思考内容（流式：前缀/后缀可能被切在两块之间）
export class ThinkSplitter {
  private state: 'start' | 'in' | 'out';
  private buf = '';
  private closed = false; // 刚闭合：吞掉后缀后面紧跟的空白
  private readonly prefix: string;
  private readonly suffix: string;
  constructor(prefix: string, suffix: string) {
    this.prefix = prefix;
    this.suffix = suffix;
    this.state = prefix.trim() && suffix.trim() ? 'start' : 'out';
  }
  push(text: string): { reasoning: string; content: string } {
    if (this.state === 'out') {
      if (!this.closed) return { reasoning: '', content: text };
      const content = text.replace(/^\s+/, '');
      if (content) this.closed = false;
      return { reasoning: '', content };
    }
    this.buf += text;
    let reasoning = '';
    let content = '';
    if (this.state === 'start') {
      const lead = this.buf.trimStart();
      const prefix = this.prefix.trim();
      if (lead.length < prefix.length && prefix.startsWith(lead)) return { reasoning, content };
      if (lead.startsWith(prefix)) {
        this.state = 'in';
        this.buf = lead.slice(prefix.length);
      } else {
        this.state = 'out';
        content = this.buf;
        this.buf = '';
        return { reasoning, content };
      }
    }
    if (this.state === 'in') {
      const suffix = this.suffix.trim();
      const at = this.buf.indexOf(suffix);
      if (at >= 0) {
        reasoning = this.buf.slice(0, at);
        content = this.buf.slice(at + suffix.length).replace(/^\s+/, '');
        this.buf = '';
        this.state = 'out';
        this.closed = !content;
      } else {
        let hold = 0;
        for (let size = Math.min(suffix.length - 1, this.buf.length); size > 0; size -= 1) {
          if (suffix.startsWith(this.buf.slice(-size))) { hold = size; break; }
        }
        reasoning = this.buf.slice(0, this.buf.length - hold);
        this.buf = this.buf.slice(this.buf.length - hold);
      }
    }
    return { reasoning, content };
  }
  // 流结束：还在开头缓冲的当正文；思考没闭合的把剩下的当思考（ST 同样处理）
  flush(): { reasoning: string; content: string } {
    const rest = this.buf;
    this.buf = '';
    if (this.state === 'in') return { reasoning: rest, content: '' };
    return { reasoning: '', content: rest };
  }
}

type Parsed = { content: string[]; reasoning: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; finish?: string; error?: string };

// 解析一个 SSE data 负载或整段 JSON（网关不支持流式时会直接回完整 JSON）
function parseChunk(json: any): Parsed {
  const out: Parsed = { content: [], reasoning: [] };
  if (json?.error) {
    const message = typeof json.error === 'string' ? json.error : json.error?.message ?? JSON.stringify(json.error);
    out.error = String(message).slice(0, 200);
    return out;
  }
  const choice = json?.choices?.[0];
  const delta = choice?.delta ?? choice?.message;
  if (delta) {
    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === 'string' && reasoning) out.reasoning.push(reasoning);
    const content = delta.content;
    if (typeof content === 'string' && content) out.content.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) if (typeof part?.text === 'string' && part.text) out.content.push(part.text);
    }
  } else if (typeof choice?.text === 'string' && choice.text) {
    out.content.push(choice.text);
  }
  if (choice?.finish_reason) out.finish = String(choice.finish_reason);
  if (json?.usage) {
    const promptTokens = Number(json.usage.prompt_tokens ?? json.usage.input_tokens ?? 0);
    const completionTokens = Number(json.usage.completion_tokens ?? json.usage.output_tokens ?? 0);
    const totalTokens = Number(json.usage.total_tokens ?? promptTokens + completionTokens);
    if (promptTokens || completionTokens) out.usage = { promptTokens, completionTokens, totalTokens };
  }
  return out;
}

// 逐块产出：reasoning_content（模型的思考）与 content（正文）分开，UI 只展示正文。
// stream_options.include_usage 让网关在最后一个分片带 usage（实测 cjms.cc 支持）；不支持时会走估算兜底。
// 稳定性：等响应头有连接超时；流开始后按「两块之间的空闲时间」判超时（长回复不会被总时长误杀），另有总时长上限；
// 限流/网关故障按 Retry-After 退避重试；400 且是采样字段不认识就去掉这些字段再试；
// 只在还没输出任何内容时切线路，不会重复扣费；流里的 error 负载、空回复都会报错而不是静默结束。
export async function* streamChat(messages: ChatMessage[], options: StreamOptions = {}): AsyncGenerator<StreamEvent> {
  if (!modelConfigured()) throw new UpstreamError('模型未配置：请在后台「模型与网关」或 .env.local 配置', 'unavailable');
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
  const stops = [...new Set((options.stop ?? []).filter((item) => typeof item === 'string' && item.length > 0))];
  if (stops.length) body.stop = stops.slice(0, MAX_API_STOPS);

  // 上游必须有超时；否则一个挂起的网关会一直占着连接和内存。
  const connectMs = envMs('TAVERN_UPSTREAM_TIMEOUT_MS', 120_000, 1000);
  const idleMs = envMs('TAVERN_UPSTREAM_IDLE_MS', 90_000, 1000);
  const totalMs = envMs('TAVERN_UPSTREAM_MAX_MS', 600_000, 5000);
  const routes = modelRoutes(options.model);
  if (!routes.length) throw new UpstreamError('模型未配置：请在后台「模型与网关」或 .env.local 配置', 'unavailable');

  // 每次请求一个控制器：连接超时只废掉这一次，还能换下一条线路；玩家停止 / 总时长到了就整体停
  let local = new AbortController();
  let timedOut = '';
  let expired = false;
  const abortWith = (why: string) => { if (!local.signal.aborted) { timedOut = why; local.abort(); } };
  const onOuter = () => local.abort();
  options.signal?.addEventListener('abort', onOuter, { once: true });
  if (options.signal?.aborted) local.abort();
  const totalTimer = setTimeout(() => { expired = true; abortWith(`生成超过 ${Math.round(totalMs / 1000)} 秒，已停止`); }, totalMs);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = (ms: number, why: string) => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abortWith(why), ms);
  };
  const disarm = () => { if (idleTimer) clearTimeout(idleTimer); idleTimer = null; };
  const userAborted = () => Boolean(options.signal?.aborted);
  const abortError = () => {
    if (userAborted()) { const error = new Error('生成已中断'); error.name = 'AbortError'; return error; }
    return new UpstreamError(timedOut || '上游连接超时', 'timeout');
  };
  const wait = (ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    local.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });

  try {
    // 先主线路，再按顺序尝试备用线路
    let response: Response | null = null;
    let usedModel = '';
    let lastError = '';
    for (let routeIndex = 0; routeIndex < routes.length && !response; routeIndex += 1) {
      const route = routes[routeIndex];
      let payload: Record<string, unknown> = { ...body, model: route.model };
      let strippedExtras = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        let retry = false;
        let delay = 400 * (attempt + 1);
        if (local.signal.aborted && !userAborted() && !expired) { local = new AbortController(); timedOut = ''; }
        try {
          armIdle(connectMs, `上游 ${Math.round(connectMs / 1000)} 秒没有响应`);
          const candidate = await fetch(`${route.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', Authorization: `Bearer ${route.apiKey}` },
            body: JSON.stringify(payload),
            signal: local.signal,
          });
          if (candidate.ok && candidate.body) {
            response = candidate;
            usedModel = route.model;
            break;
          }
          const detail = await candidate.text().catch(() => '');
          lastError = `${route.model} 返回 ${candidate.status}${detail ? `：${upstreamMessage(detail)}` : ''}`;
          if (candidate.status === 400 && !strippedExtras && EXTRA_PARAMS.some((key) => key in payload && detail.includes(key))) {
            payload = Object.fromEntries(Object.entries(payload).filter(([key]) => !EXTRA_PARAMS.includes(key)));
            strippedExtras = true;
            retry = true;
            delay = 0;
          } else if (candidate.status === 400 && 'stream_options' in payload && /stream_options/.test(detail)) {
            // 老网关不认识 stream_options
            const { stream_options: _ignored, ...rest } = payload;
            payload = rest;
            retry = true;
            delay = 0;
          } else if (RETRYABLE.has(candidate.status)) {
            retry = attempt < 1;
            delay = Math.max(delay, retryAfterMs(candidate));
          }
        } catch (error) {
          if (userAborted()) throw abortError();
          lastError = `${route.model}：${timedOut || (error instanceof Error ? error.message : String(error))}`;
          if (expired) throw abortError();
          // 连接超时：同一条线路不再等，直接换下一条
          if (local.signal.aborted) break;
          retry = attempt < 1;
        }
        if (!retry) break;
        disarm();
        await wait(delay);
        if (userAborted()) throw abortError();
      }
      if (!response && routeIndex < routes.length - 1) { disarm(); await wait(250); }
    }
    if (!response?.ok || !response.body) {
      throw new UpstreamError(`模型线路均不可用${lastError ? `：${lastError}` : ''}`, 'unavailable');
    }
    yield { type: 'route', model: usedModel };

    const trimmer = new StopTrimmer(stops);
    const splitter = options.reasoningTags ? new ThinkSplitter(options.reasoningTags.prefix, options.reasoningTags.suffix) : null;
    let produced = false;
    let reasoned = false;
    let finish = '';
    const handle = function* (parsed: Parsed): Generator<StreamEvent> {
      if (parsed.error) {
        throw new UpstreamError(`上游中途报错：${parsed.error}`);
      }
      for (const text of parsed.reasoning) { reasoned = true; yield { type: 'reasoning', text }; }
      for (const raw of parsed.content) {
        const part = splitter ? splitter.push(raw) : { reasoning: '', content: raw };
        if (part.reasoning) { reasoned = true; yield { type: 'reasoning', text: part.reasoning }; }
        const out = part.content ? trimmer.push(part.content) : '';
        if (out) { produced = true; yield { type: 'content', text: out }; }
      }
      if (parsed.finish) finish = parsed.finish;
      if (parsed.usage) yield { type: 'usage', ...parsed.usage };
    };

    const contentType = response.headers.get('content-type') ?? '';
    if (/application\/json/i.test(contentType) && !/event-stream/i.test(contentType)) {
      // 网关忽略了 stream:true，直接回了完整 JSON
      armIdle(idleMs, `上游 ${Math.round(idleMs / 1000)} 秒没有新内容`);
      const raw = await response.text();
      let json: unknown;
      try { json = JSON.parse(raw); } catch { throw new UpstreamError('上游返回的内容无法解析'); }
      yield* handle(parseChunk(json));
    } else {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let dataLines: string[] = [];
      const dispatch = function* (): Generator<StreamEvent> {
        if (!dataLines.length) return;
        const payload = dataLines.join('\n').trim();
        dataLines = [];
        if (!payload || payload === '[DONE]') return;
        let json: unknown;
        try { json = JSON.parse(payload); } catch { return; } // 单个分片解析失败不打断整条流
        yield* handle(parseChunk(json));
      };
      try {
        while (!trimmer.stopped) {
          armIdle(idleMs, `上游 ${Math.round(idleMs / 1000)} 秒没有新内容`);
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (error) {
            if (local.signal.aborted) throw abortError();
            throw new UpstreamError(`上游连接中断：${error instanceof Error ? error.message : String(error)}`);
          }
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split(/\r\n|\r|\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) { yield* dispatch(); continue; }
            if (line.startsWith(':')) continue; // 心跳注释
            if (line.startsWith('data:')) {
              // 有的网关每行一个事件、不发空行：遇到新 data 行先把上一个派发掉（能单独解析的话）
              if (dataLines.length) {
                const prev = dataLines.join('\n').trim();
                if (prev === '[DONE]' || (() => { try { JSON.parse(prev); return true; } catch { return false; } })()) yield* dispatch();
              }
              dataLines.push(line.slice(5).replace(/^ /, ''));
            } else if (!line.includes(':') && line.trim().startsWith('{')) {
              // 非标准：裸 JSON 行
              dataLines.push(line.trim());
              yield* dispatch();
            }
            if (trimmer.stopped) break;
          }
        }
        if (!trimmer.stopped) {
          buffer += decoder.decode();
          if (buffer.trim()) {
            if (buffer.startsWith('data:')) dataLines.push(buffer.slice(5).replace(/^ /, ''));
            else if (buffer.trim().startsWith('{')) dataLines.push(buffer.trim());
          }
          yield* dispatch();
        }
      } finally {
        if (trimmer.stopped) await reader.cancel().catch(() => undefined);
      }
    }
    if (splitter) {
      const tail = splitter.flush();
      if (tail.reasoning) { reasoned = true; yield { type: 'reasoning', text: tail.reasoning }; }
      const out = tail.content ? trimmer.push(tail.content) : '';
      if (out) { produced = true; yield { type: 'content', text: out }; }
    }
    const rest = trimmer.flush();
    if (rest) { produced = true; yield { type: 'content', text: rest }; }
    if (trimmer.stopped) finish = 'stop_string';
    if (!produced) {
      if (finish === 'content_filter') throw new UpstreamError('回复被上游内容过滤拦下了，换个说法或换个模型试试', 'empty');
      if (reasoned) throw new UpstreamError('模型只输出了思考过程、没有正文（可能是回复长度上限太小），可以调大回复长度后重试', 'empty');
      throw new UpstreamError('模型返回了空回复，可以重试或换个模型', 'empty');
    }
    if (finish) yield { type: 'finish', reason: finish };
  } catch (error) {
    if (local.signal.aborted && !(error instanceof UpstreamError)) throw abortError();
    throw error;
  } finally {
    clearTimeout(totalTimer);
    disarm();
    options.signal?.removeEventListener('abort', onOuter);
  }
}
