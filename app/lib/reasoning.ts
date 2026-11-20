// 思考内容的存取（纯函数，db.ts / rooms.ts 也用，不能反过来依赖 db）

export type Reasoning = { t: string; ms: number };
export type ReasoningMap = Record<string, Reasoning>;

export function parseReasoning(raw: string | null | undefined): ReasoningMap {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as ReasoningMap) : {};
  } catch {
    return {};
  }
}

export function reasoningAt(raw: string | null | undefined, index: number): Reasoning | null {
  const item = parseReasoning(raw)[String(index)];
  return item && typeof item.t === 'string' && item.t.trim() ? item : null;
}

export function withReasoning(raw: string | null | undefined, index: number, value: Reasoning | null): string | null {
  const map = parseReasoning(raw);
  if (value && value.t.trim()) map[String(index)] = { t: value.t, ms: Math.max(0, Math.round(value.ms)) };
  else delete map[String(index)];
  return Object.keys(map).length ? JSON.stringify(map) : null;
}

