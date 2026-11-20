// 每条回复（按候选）的生成信息：模型、输出 tokens、耗时、完成时间。对应 ST 的 swipe_info / gen_started / gen_finished / extra.model。
// 纯函数，db.ts 也用。
export type GenMeta = { model: string; tokens: number; ms: number; at: number };
export type GenMetaMap = Record<string, GenMeta>;

export function parseMeta(raw: string | null | undefined): GenMetaMap {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as GenMetaMap) : {};
  } catch {
    return {};
  }
}

export function metaAt(raw: string | null | undefined, index: number): GenMeta | null {
  const item = parseMeta(raw)[String(index)];
  return item && typeof item.model === 'string' ? item : null;
}

export function withMeta(raw: string | null | undefined, index: number, value: GenMeta | null): string | null {
  const map = parseMeta(raw);
  if (value) map[String(index)] = { model: String(value.model).slice(0, 80), tokens: Math.max(0, Math.round(value.tokens)), ms: Math.max(0, Math.round(value.ms)), at: value.at };
  else delete map[String(index)];
  return Object.keys(map).length ? JSON.stringify(map) : null;
}

// 续写：同一个候选累加 tokens 和耗时
export function addMeta(raw: string | null | undefined, index: number, value: GenMeta): string | null {
  const prev = metaAt(raw, index);
  return withMeta(raw, index, prev ? { model: value.model, tokens: prev.tokens + value.tokens, ms: prev.ms + value.ms, at: value.at } : value);
}
