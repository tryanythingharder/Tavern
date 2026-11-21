// ST 的全局生成行为设置（ST 存在 power_user 里，不随预设切换）：
//  - 自定义停止词 custom_stopping_strings（JSON 数组，可替换宏）
//  - 裁剪不完整的句子 trim_sentences
//  - 自动继续 auto_continue（回复不到目标长度就自动「继续」）
//  - 思考内容 reasoning（自动解析 <think>、展开、加入提示词、最多加入几条）
import db from '@/lib/db';
import { estimateTokens } from '@/lib/usage';
import { DEFAULT_TRANSLATE_PREFS, normalizeTranslatePrefs, type TranslatePrefs } from '@/lib/translation';

export type GenPrefs = {
  stopStrings: string[];
  stopMacros: boolean;
  trimSentences: boolean;
  autoContinue: { enabled: boolean; target: number };
  reasoning: { autoParse: boolean; prefix: string; suffix: string; autoExpand: boolean; addToPrompts: boolean; maxAdditions: number };
  // ST 世界书「插入策略」world_info_character_strategy：均匀排序 / 角色优先（ST 默认）/ 全局优先
  loreStrategy: LoreStrategy;
  // ST Vector Storage 的世界书部分：enabled_world_info / enabled_for_all / max_entries / score_threshold / depth
  loreVectors: LoreVectorPrefs;
  // ST Translate 扩展：目标语言、自动翻译（回复/输入）、发给模型的语言
  translate: TranslatePrefs;
};

export type LoreVectorPrefs = { enabled: boolean; allEntries: boolean; maxEntries: number; threshold: number; queryMessages: number };
export const DEFAULT_LORE_VECTORS: LoreVectorPrefs = { enabled: false, allEntries: false, maxEntries: 5, threshold: 0.25, queryMessages: 2 };

export type LoreStrategy = 'evenly' | 'character_first' | 'global_first';
export const LORE_STRATEGIES: LoreStrategy[] = ['evenly', 'character_first', 'global_first'];

// 和 ST 默认一致，唯一不同：自动解析 <think> 默认开（不开的话很多模型的思考会直接混进正文，新手看着像乱码）
export const DEFAULT_GEN_PREFS: GenPrefs = {
  stopStrings: [],
  stopMacros: true,
  trimSentences: false,
  autoContinue: { enabled: false, target: 400 },
  reasoning: { autoParse: true, prefix: '<think>', suffix: '</think>', autoExpand: false, addToPrompts: false, maxAdditions: 1 },
  loreStrategy: 'character_first',
  loreVectors: DEFAULT_LORE_VECTORS,
  translate: DEFAULT_TRANSLATE_PREFS,
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ST 的输入框里写的是 JSON 数组（["\n{{user}}:", "###"]）；也接受每行一个
export function parseStopStrings(value: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      list = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      list = value.split('\n');
    }
  }
  return [...new Set(list.filter((item): item is string => typeof item === 'string' && item.length > 0).map((item) => item.slice(0, 200)))].slice(0, 32);
}

export function normalizeGenPrefs(raw: unknown): GenPrefs {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_GEN_PREFS;
  const ac = input.autoContinue ?? {};
  const rs = input.reasoning ?? {};
  return {
    stopStrings: input.stopStrings === undefined ? d.stopStrings : parseStopStrings(input.stopStrings),
    stopMacros: typeof input.stopMacros === 'boolean' ? input.stopMacros : d.stopMacros,
    trimSentences: typeof input.trimSentences === 'boolean' ? input.trimSentences : d.trimSentences,
    autoContinue: {
      enabled: typeof ac.enabled === 'boolean' ? ac.enabled : d.autoContinue.enabled,
      target: clampInt(ac.target, 0, 4096, d.autoContinue.target),
    },
    reasoning: {
      autoParse: typeof rs.autoParse === 'boolean' ? rs.autoParse : d.reasoning.autoParse,
      prefix: typeof rs.prefix === 'string' ? rs.prefix.slice(0, 40) : d.reasoning.prefix,
      suffix: typeof rs.suffix === 'string' ? rs.suffix.slice(0, 40) : d.reasoning.suffix,
      autoExpand: typeof rs.autoExpand === 'boolean' ? rs.autoExpand : d.reasoning.autoExpand,
      addToPrompts: typeof rs.addToPrompts === 'boolean' ? rs.addToPrompts : d.reasoning.addToPrompts,
      maxAdditions: clampInt(rs.maxAdditions, 0, 50, d.reasoning.maxAdditions),
    },
    loreStrategy: LORE_STRATEGIES.includes(input.loreStrategy) ? input.loreStrategy : d.loreStrategy,
    loreVectors: normalizeLoreVectors(input.loreVectors),
    translate: normalizeTranslatePrefs(input.translate),
  };
}

function normalizeLoreVectors(raw: unknown): LoreVectorPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LORE_VECTORS;
  const threshold = Number(v.threshold);
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : d.enabled,
    allEntries: typeof v.allEntries === 'boolean' ? v.allEntries : d.allEntries,
    maxEntries: clampInt(v.maxEntries, 1, 50, d.maxEntries),
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? Math.round(threshold * 100) / 100 : d.threshold,
    queryMessages: clampInt(v.queryMessages, 1, 10, d.queryMessages),
  };
}

export function getGenPrefs(userId: number): GenPrefs {
  const row = db.prepare('SELECT gen_prefs FROM users WHERE id = ?').get(userId) as { gen_prefs: string | null } | undefined;
  if (!row?.gen_prefs) return normalizeGenPrefs(null);
  try {
    return normalizeGenPrefs(JSON.parse(row.gen_prefs));
  } catch {
    return normalizeGenPrefs(null);
  }
}

export function setGenPrefs(userId: number, patch: unknown): GenPrefs {
  const current = getGenPrefs(userId);
  const input = (patch && typeof patch === 'object' ? patch : {}) as Record<string, any>;
  const next = normalizeGenPrefs({
    ...current,
    ...input,
    autoContinue: { ...current.autoContinue, ...(input.autoContinue ?? {}) },
    reasoning: { ...current.reasoning, ...(input.reasoning ?? {}) },
    translate: { ...current.translate, ...(input.translate ?? {}) },
    loreVectors: { ...current.loreVectors, ...(input.loreVectors ?? {}) },
  });
  db.prepare('UPDATE users SET gen_prefs = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return next;
}

// 停止词里的宏：ST 默认替换（{{user}} {{char}}，群聊里 {{char}} 是本次发言的角色）
export function resolveStopStrings(prefs: GenPrefs, names: { user: string; char: string }): string[] {
  if (!prefs.stopMacros) return prefs.stopStrings;
  return prefs.stopStrings.map((item) => item.replace(/\{\{user\}\}/gi, () => names.user).replace(/\{\{char\}\}/gi, () => names.char)).filter(Boolean);
}

// ST trimToEndSentence：裁到最后一个句末标点（含 emoji）；一个都没有就原样（去掉尾部空白）。
// 在 ST 的标点集合上补了中文常见的『』…～，否则「……」结尾的中文回复会被多裁一截。
const END_PUNCT = new Set(['.', '!', '?', '*', '"', ')', '}', '`', ']', '$', '。', '！', '？', '”', '）', '】', '’', '」', '_', '』', '…', '～', '~']);
const EMOJI = /\p{Extended_Pictographic}/u;
export function trimToEndSentence(input: string): string {
  if (!input) return input;
  const chars = Array.from(input);
  let last = -1;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const char = chars[i];
    const emoji = EMOJI.test(char);
    if (END_PUNCT.has(char) || emoji) {
      last = !emoji && i > 0 && /\s/.test(chars[i - 1]) ? i - 1 : i;
      break;
    }
  }
  if (last === -1) return input.trimEnd();
  return chars.slice(0, last + 1).join('').trimEnd();
}

// 自动继续：ST 在回复 token 数小于目标长度时自动发「继续」；没产出、被中断时不继续
export function wantsAutoContinue(prefs: GenPrefs, fullText: string, added: string, finish: string): boolean {
  if (!prefs.autoContinue.enabled || prefs.autoContinue.target <= 0) return false;
  if (!added.trim()) return false;
  if (finish === 'content_filter' || finish === 'stop_string') return false;
  return estimateTokens(fullText) < prefs.autoContinue.target;
}

import { reasoningAt, type Reasoning } from '@/lib/reasoning';
export { parseReasoning, reasoningAt, withReasoning, type Reasoning, type ReasoningMap } from '@/lib/reasoning';

// ST「加入提示词」：最近 maxAdditions 条角色消息前面拼上 前缀 + 思考 + 后缀
export function addReasoningToHistory<T extends { role: string; content: string; reasoning?: string | null; selected?: number; thought?: Reasoning | null }>(history: T[], prefs: GenPrefs): T[] {
  if (!prefs.reasoning.addToPrompts || prefs.reasoning.maxAdditions <= 0) return history;
  let left = prefs.reasoning.maxAdditions;
  const out = [...history];
  for (let i = out.length - 1; i >= 0 && left > 0; i -= 1) {
    const message = out[i];
    if (message.role !== 'assistant') continue;
    const item = message.thought !== undefined ? message.thought : reasoningAt(message.reasoning ?? null, message.selected ?? 0);
    if (!item) continue;
    left -= 1;
    const { prefix, suffix } = prefs.reasoning;
    out[i] = { ...message, content: `${prefix}\n${item.t}\n${suffix}\n\n${message.content}` };
  }
  return out;
}

// 一次生成里的思考内容与结束原因：思考用时 = 第一段思考到第一段正文（ST 显示「思考了 N 秒」）
export class GenTrace {
  thinking = '';
  finish = '';
  private started = 0;
  private ms = 0;
  onReasoning(text: string) {
    if (!this.started) this.started = Date.now();
    this.thinking += text;
  }
  onContent() {
    if (this.started && !this.ms) this.ms = Date.now() - this.started;
  }
  result(): { t: string; ms: number } | null {
    const t = this.thinking.trim();
    if (!t) return null;
    return { t, ms: this.ms || (this.started ? Date.now() - this.started : 0) };
  }
}

// 各生成路由共用：本次要用的停止词与 <think> 解析
export function streamExtras(prefs: GenPrefs, base: string[], names: { user: string; char: string }) {
  return {
    stop: [...base, ...resolveStopStrings(prefs, names)],
    names,
    reasoningTags: prefs.reasoning.autoParse ? { prefix: prefs.reasoning.prefix, suffix: prefs.reasoning.suffix } : null,
  };
}
