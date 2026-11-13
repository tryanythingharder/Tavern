import db from '@/lib/db';
import type { ModelRoute } from '@/lib/model';

// 上游文本渠道：后台可建多条，按 priority 从大到小依次尝试。
// 与 new-api 的渠道类似：名称、Base URL、密钥、模型列表、默认模型、优先级、启停、连通性测试。
export type Channel = {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  priority: number;
  enabled: boolean;
  lastTestAt: number | null;
  lastTestOk: boolean | null;
  lastTestNote: string;
  createdAt: number;
  updatedAt: number;
};

type Row = {
  id: number;
  name: string;
  base_url: string;
  api_key: string;
  models: string;
  default_model: string;
  priority: number;
  enabled: number;
  last_test_at: number | null;
  last_test_ok: number | null;
  last_test_note: string | null;
  created_at: number;
  updated_at: number;
};

function parseModels(raw: string): string[] {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].slice(0, 300);
  } catch {
    return [];
  }
}

function toChannel(row: Row): Channel {
  const models = parseModels(row.models);
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    models,
    defaultModel: row.default_model && models.includes(row.default_model) ? row.default_model : (models[0] ?? ''),
    priority: row.priority,
    enabled: row.enabled === 1,
    lastTestAt: row.last_test_at,
    lastTestOk: row.last_test_ok === null ? null : row.last_test_ok === 1,
    lastTestNote: row.last_test_note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChannels(): Channel[] {
  const rows = db.prepare('SELECT * FROM model_channels ORDER BY priority DESC, id ASC').all() as Row[];
  return rows.map(toChannel);
}

export function getChannel(id: number): Channel | null {
  const row = db.prepare('SELECT * FROM model_channels WHERE id = ?').get(id) as Row | undefined;
  return row ? toChannel(row) : null;
}

export function channelCount(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM model_channels').get() as { count: number }).count;
}

// 给后台前端的安全视图：不含密钥。
export type PublicChannel = Omit<Channel, 'apiKey'> & { hasKey: boolean };

export function publicChannel(channel: Channel): PublicChannel {
  const { apiKey, ...rest } = channel;
  return { ...rest, hasKey: Boolean(apiKey) };
}

export type ChannelInput = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: unknown;
  defaultModel?: string;
  priority?: number;
  enabled?: boolean;
};

function normalize(input: ChannelInput, fallbackName = '新渠道') {
  const baseUrl = String(input.baseUrl ?? '').trim().replace(/\/+$/, '').slice(0, 300);
  const name = String(input.name ?? '').trim().slice(0, 40) || fallbackName;
  const models = Array.isArray(input.models)
    ? [...new Set(input.models.map((item) => String(item).trim()).filter(Boolean))].slice(0, 300)
    : [];
  const defaultModel = String(input.defaultModel ?? '').trim();
  const priority = Number.isFinite(Number(input.priority)) ? Math.trunc(Number(input.priority)) : 0;
  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  return {
    name,
    baseUrl,
    models,
    defaultModel: defaultModel && models.includes(defaultModel) ? defaultModel : (models[0] ?? ''),
    priority: Math.max(-1000, Math.min(1000, priority)),
    enabled,
  };
}

function assertHttpUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Base URL 需要以 http:// 或 https:// 开头');
}

export function createChannel(input: ChannelInput): Channel {
  const value = normalize(input);
  if (!value.baseUrl) throw new Error('Base URL 不能为空');
  assertHttpUrl(value.baseUrl);
  const apiKey = String(input.apiKey ?? '').trim();
  if (!apiKey) throw new Error('API Key 不能为空');
  const now = Date.now();
  const result = db.prepare(`
        INSERT INTO model_channels (name, base_url, api_key, models, default_model, priority, enabled, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
    `).run(value.name, value.baseUrl, apiKey, JSON.stringify(value.models), value.defaultModel, value.priority, value.enabled ? 1 : 0, now, now);
  return getChannel(Number(result.lastInsertRowid))!;
}

// apiKey 留空表示保持不变（和接口配置页一致）；未提供的字段沿用原值
export function updateChannel(id: number, input: ChannelInput): Channel | null {
  const current = getChannel(id);
  if (!current) return null;
  const value = normalize({
    name: input.name ?? current.name,
    baseUrl: input.baseUrl ?? current.baseUrl,
    models: input.models === undefined ? current.models : input.models,
    defaultModel: input.defaultModel ?? current.defaultModel,
    priority: input.priority === undefined ? current.priority : input.priority,
    enabled: input.enabled === undefined ? current.enabled : input.enabled,
  }, current.name);
  if (!value.baseUrl) throw new Error('Base URL 不能为空');
  assertHttpUrl(value.baseUrl);
  const apiKey = String(input.apiKey ?? '').trim() || current.apiKey;
  db.prepare(`
        UPDATE model_channels SET name=?, base_url=?, api_key=?, models=?, default_model=?, priority=?, enabled=?, updated_at=? WHERE id=?
    `).run(value.name, value.baseUrl, apiKey, JSON.stringify(value.models), value.defaultModel, value.priority, value.enabled ? 1 : 0, Date.now(), id);
  return getChannel(id);
}

export function setChannelEnabled(id: number, enabled: boolean): Channel | null {
  db.prepare('UPDATE model_channels SET enabled=?, updated_at=? WHERE id=?').run(enabled ? 1 : 0, Date.now(), id);
  return getChannel(id);
}

export function deleteChannel(id: number): boolean {
  const result = db.prepare('DELETE FROM model_channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function recordChannelTest(id: number, ok: boolean, note: string): void {
  db.prepare('UPDATE model_channels SET last_test_at=?, last_test_ok=?, last_test_note=? WHERE id=?').run(
    Date.now(),
    ok ? 1 : 0,
    note.slice(0, 300),
    id,
  );
}

// 启用的渠道 → 生成线路；priority 大的先试，同优先级按创建顺序。
export function channelRoutes(): ModelRoute[] {
  return listChannels()
    .filter((channel) => channel.enabled && channel.baseUrl && channel.apiKey && channel.defaultModel)
    .map((channel) => ({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, model: channel.defaultModel }));
}

// GET {baseUrl}/models：兼容 data[] / models[] / 顶层数组三种返回。
export async function fetchUpstreamModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('请先填写 Base URL');
  assertHttpUrl(base);
  if (!apiKey.trim()) throw new Error('请先填写 API Key');
  let response: Response;
  try {
    response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`无法连接上游：${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`上游返回 ${response.status}${text ? `：${text.slice(0, 160)}` : ''}`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('上游返回的不是 JSON');
  }
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: unknown[] }).data
      : Array.isArray((payload as { models?: unknown }).models)
        ? (payload as { models: unknown[] }).models
        : [];
  const ids = list
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return String(record.id ?? record.name ?? record.model ?? '').trim();
      }
      return '';
    })
    .filter(Boolean);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b)).slice(0, 500);
}
