// M2 设定资源：预设、世界书、正则、身份、快捷回复。
// 这里的归一化与导入解析对齐 prototype/platform.js 的同名函数（那份代码就是语义规格），
// 同时兼容 SillyTavern 导出的预设 / 世界书 / 正则 JSON。

export const DEFAULT_CONTEXT_TEMPLATE = [
  '【角色名】{{char}}',
  '【一句话简介】{{hook}}',
  '【角色描述】{{description}}',
  '【人设】{{personality}}',
  '【场景】{{scenario}}',
  '【设定】{{legacy}}',
  '【作者提示词】{{instructions}}',
].join('\n');

export const CONTEXT_PLACEHOLDERS = ['char', 'hook', 'description', 'personality', 'scenario', 'legacy', 'instructions'] as const;

export const PROMPT_BLOCKS = [
  ['system', '系统提示'],
  ['character', '角色设定'],
  ['persona', '玩家身份'],
  ['lore', '世界书命中'],
  ['autosummary', '自动摘要'],
  ['rag', '记忆检索'],
  ['memory', '记忆摘要'],
  ['note', '作者注释'],
  ['examples', '对话示例'],
  ['history', '最近消息'],
  ['jailbreak', '后置提示'],
] as const;

export type PromptBlockKey = (typeof PROMPT_BLOCKS)[number][0];

export const LORE_POSITIONS = [
  ['before', '角色设定之前'],
  ['after', '角色设定之后'],
  ['anTop', '作者注释之前'],
  ['anBottom', '作者注释之后'],
  ['depth', '插入历史深度'],
  ['emTop', '对话示例之前'],
  ['emBottom', '对话示例之后'],
  ['outlet', '出口（宏引用）'],
] as const;
export type LorePosition = (typeof LORE_POSITIONS)[number][0];

export const LORE_LOGICS = [
  ['andAny', '包含任一'],
  ['notAll', '不全包含'],
  ['notAny', '都不包含'],
  ['andAll', '全部包含'],
] as const;
export type LoreLogic = (typeof LORE_LOGICS)[number][0];

export type LoreRole = 'system' | 'user' | 'assistant';

export const PROMPT_CHAR_BUDGET = 6000;
export const LORE_SCAN_DEPTH = 12;
export const LORE_BUDGET = 2000;

// ---------- 小工具 ----------

export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : fallback;
}

export function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

export function int(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clamp(value, min, max, fallback));
}

export function optionalInt(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return null;
  return Math.round(Math.min(Math.max(number, min), max));
}

export function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function optionalBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function stringList(value: unknown, limit = 100): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,，\n]/) : [];
  return list.map((item) => text(item).trim()).filter(Boolean).slice(0, limit);
}

// ---------- 预设 ----------

export type PresetParams = {
  temperature: number;
  topP: number;
  topK: number;
  minP: number;
  typicalP: number;
  repetitionPenalty: number;
  repetitionPenaltyRange: number;
  repetitionPenaltySlope: number;
  presencePenalty: number;
  frequencyPenalty: number;
  maxTokens: number;
  // ST 的「上下文长度」(openai_max_context)：0 = 跟随模型上限；填了就用它，但不超过模型上限
  contextSize: number;
  seed: number;
};

export type PresetInstruct = { enabled: boolean; input: string; output: string; system: string; stop: string };
export type PromptOrderItem = { key: string; enabled: boolean };

export type Preset = {
  id: number;
  name: string;
  system: string;
  jailbreak: string;
  params: PresetParams;
  contextTemplate: string;
  instruct: PresetInstruct;
  order: PromptOrderItem[];
  forbidOverrides: boolean;
};

export const DEFAULT_PARAMS: PresetParams = {
  temperature: 0.9,
  topP: 0.95,
  topK: 0,
  minP: 0,
  typicalP: 1,
  repetitionPenalty: 1.1,
  repetitionPenaltyRange: 1024,
  repetitionPenaltySlope: 0.7,
  presencePenalty: 0,
  frequencyPenalty: 0,
  maxTokens: 400,
  contextSize: 0,
  seed: -1,
};

export const DEFAULT_SYSTEM_PROMPT =
  '你是这个故事里的角色。保持角色口吻与已建立的设定，不替玩家决定行动，不复述玩家的设定。';

export function normalizeParams(raw: unknown): PresetParams {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    temperature: clamp(source.temperature, 0, 2, DEFAULT_PARAMS.temperature),
    topP: clamp(source.topP, 0.05, 1, DEFAULT_PARAMS.topP),
    topK: int(source.topK, 0, 200, DEFAULT_PARAMS.topK),
    minP: clamp(source.minP, 0, 1, DEFAULT_PARAMS.minP),
    typicalP: clamp(source.typicalP, 0, 1, DEFAULT_PARAMS.typicalP),
    repetitionPenalty: clamp(source.repetitionPenalty, 1, 2, DEFAULT_PARAMS.repetitionPenalty),
    repetitionPenaltyRange: int(source.repetitionPenaltyRange, 0, 8192, DEFAULT_PARAMS.repetitionPenaltyRange),
    repetitionPenaltySlope: clamp(source.repetitionPenaltySlope, 0, 10, DEFAULT_PARAMS.repetitionPenaltySlope),
    presencePenalty: clamp(source.presencePenalty, -2, 2, DEFAULT_PARAMS.presencePenalty),
    frequencyPenalty: clamp(source.frequencyPenalty, -2, 2, DEFAULT_PARAMS.frequencyPenalty),
    maxTokens: int(source.maxTokens, 16, 8192, DEFAULT_PARAMS.maxTokens),
    contextSize: int(source.contextSize, 0, 10_000_000, DEFAULT_PARAMS.contextSize),
    seed: int(source.seed, -1, 2147483647, DEFAULT_PARAMS.seed),
  };
}

export function normalizeInstruct(raw: unknown): PresetInstruct {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: source.enabled === true,
    input: text(source.input),
    output: text(source.output),
    system: text(source.system),
    stop: text(source.stop),
  };
}

// 块顺序：先保留调用方给的合法顺序，再把缺失的内置块补进来。
export function normalizeOrder(raw: unknown): PromptOrderItem[] {
  const valid = new Set<string>(PROMPT_BLOCKS.map(([key]) => key));
  const seen = new Set<string>();
  const order: PromptOrderItem[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const key = text(source.key);
    if (!valid.has(key) || seen.has(key)) continue;
    seen.add(key);
    order.push({ key, enabled: source.enabled !== false });
  }
  for (const [key] of PROMPT_BLOCKS) if (!seen.has(key)) order.push({ key, enabled: true });
  return order;
}

export function defaultPreset(): Omit<Preset, 'id'> {
  return {
    name: '默认预设',
    system: DEFAULT_SYSTEM_PROMPT,
    jailbreak: '',
    params: { ...DEFAULT_PARAMS },
    contextTemplate: DEFAULT_CONTEXT_TEMPLATE,
    instruct: { enabled: false, input: '', output: '', system: '', stop: '' },
    order: PROMPT_BLOCKS.map(([key]) => ({ key, enabled: true })),
    forbidOverrides: false,
  };
}

export function renderContextTemplate(template: string, values: Record<string, string>): string {
  const source = template.trim() ? template : DEFAULT_CONTEXT_TEMPLATE;
  return source
    .split('\n')
    .map((line) => {
      let replaced = line;
      let touched = false;
      for (const key of CONTEXT_PLACEHOLDERS) {
        if (!replaced.includes(`{{${key}}}`)) continue;
        touched = true;
        replaced = replaced.split(`{{${key}}}`).join(values[key] ?? '');
      }
      if (!touched) return line.trim() ? line : '';
      // 占位符为空时整行丢弃，避免留下只有标签的空行
      return replaced.replace(/【[^】]*】/g, '').trim() === '' ? '' : replaced;
    })
    .filter(Boolean)
    .join('\n');
}

// ---------- 世界书 ----------

export type LoreEntry = {
  id: string;
  title: string;
  keywords: string[];
  secondaryKeywords: string[];
  logic: LoreLogic;
  selective: boolean;
  text: string;
  enabled: boolean;
  constant: boolean;
  priority: number;
  position: LorePosition;
  depth: number;
  role: LoreRole;
  outletName: string;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  probability: number;
  excludeRecursion: boolean;
  preventRecursion: boolean;
};

export type Lorebook = { id: number; name: string; entries: LoreEntry[]; updated_at: number };

const LORE_ROLES: LoreRole[] = ['system', 'user', 'assistant'];

function normalizeLorePosition(value: unknown, cardEntry: boolean): LorePosition {
  if (typeof value === 'number') return LORE_POSITIONS[value]?.[0] ?? 'before';
  if (LORE_POSITIONS.some(([key]) => key === value)) return value as LorePosition;
  if (cardEntry) return value === 'before_char' ? 'before' : 'after';
  return 'before';
}

function normalizeLogic(value: unknown): LoreLogic {
  if (typeof value === 'number') return LORE_LOGICS[value]?.[0] ?? 'andAny';
  return LORE_LOGICS.some(([key]) => key === value) ? (value as LoreLogic) : 'andAny';
}

function normalizeRole(value: unknown): LoreRole {
  if (typeof value === 'number') return LORE_ROLES[value] ?? 'system';
  return LORE_ROLES.includes(value as LoreRole) ? (value as LoreRole) : 'system';
}

export function normalizeLoreEntry(raw: unknown, index = 0): LoreEntry {
  const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const extensions = entry.extensions && typeof entry.extensions === 'object' ? (entry.extensions as Record<string, unknown>) : {};
  const pick = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null);
  const isCardEntry = Array.isArray(entry.keys) || entry.insertion_order !== undefined;
  const position = normalizeLorePosition(pick(extensions.position, entry.position), isCardEntry);
  const probability = optionalInt(pick(entry.probability, extensions.probability), 0, 100);
  return {
    id: text(entry.id, `entry-${index + 1}`),
    title: text(pick(entry.comment, entry.name, entry.title), `条目 ${index + 1}`),
    keywords: stringList(pick(entry.keywords, entry.keys, entry.key), 50),
    secondaryKeywords: stringList(pick(entry.secondaryKeywords, entry.secondary_keys, entry.keysecondary), 50),
    logic: normalizeLogic(pick(entry.logic, entry.selectiveLogic, extensions.selectiveLogic)),
    selective: isCardEntry ? entry.selective === true : entry.selective !== false,
    text: text(pick(entry.content, entry.text)),
    enabled: !(entry.disable === true || entry.enabled === false),
    constant: entry.constant === true,
    priority: Number(pick(entry.insertion_order, entry.order, entry.priority)) || 0,
    position,
    depth: optionalInt(pick(entry.depth, extensions.depth), 0, 1000) ?? 4,
    role: normalizeRole(pick(entry.role, extensions.role)),
    outletName: text(pick(entry.outletName, extensions.outlet_name)).trim().slice(0, 40),
    scanDepth: optionalInt(pick(entry.scanDepth, extensions.scan_depth), 0, 1000),
    caseSensitive: optionalBool(pick(entry.caseSensitive, extensions.case_sensitive, entry.case_sensitive)),
    matchWholeWords: optionalBool(pick(entry.matchWholeWords, extensions.match_whole_words)),
    probability: probability ?? 100,
    excludeRecursion: pick(entry.excludeRecursion, extensions.exclude_recursion) === true,
    preventRecursion: pick(entry.preventRecursion, extensions.prevent_recursion) === true,
  };
}

export function normalizeLoreEntries(raw: unknown): LoreEntry[] {
  const list = Array.isArray(raw) ? raw : [];
  return list.slice(0, 500).map((item, index) => normalizeLoreEntry(item, index));
}

// ---------- 正则 ----------

export type RegexScope = 'display' | 'send' | 'both';
export type RegexTarget = 'assistant' | 'user' | 'all';

export type RegexRule = {
  id: number;
  name: string;
  find: string;
  replacement: string;
  scope: RegexScope;
  target: RegexTarget;
  enabled: boolean;
  depthFrom: number | null;
  depthTo: number | null;
  sort: number;
  // ST 的 trimStrings：替换前先从匹配文本里删掉这些字符串
  trim?: string[];
};

export function normalizeRegexRule(raw: unknown, index = 0): RegexRule {
  const rule = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    id: Number(rule.id) || index + 1,
    name: text(rule.name, `规则 ${index + 1}`).slice(0, 60),
    find: text(rule.find),
    replacement: text(rule.replacement),
    scope: rule.scope === 'display' || rule.scope === 'send' ? rule.scope : 'both',
    target: rule.target === 'assistant' || rule.target === 'user' ? rule.target : 'all',
    enabled: rule.enabled !== false,
    depthFrom: optionalInt(rule.depthFrom, -1, 9999),
    depthTo: optionalInt(rule.depthTo, 0, 9999),
    sort: Number(rule.sort) || index,
  };
}

// ---------- 身份与快捷回复 ----------

export type PersonaPosition = 'prompt' | 'depth' | 'none';

export type Persona = {
  id: number;
  name: string;
  description: string;
  position: PersonaPosition;
  depth: number;
  role: LoreRole;
  boundCharacters: string[];
};

export type QuickReply = { id: number; label: string; content: string; sort: number };

// ---------- SillyTavern 导入 ----------

function convertStoryString(source: unknown): string {
  const value = text(source).trim();
  if (!value) return '';
  return value
    .replace(/\{\{#if[^}]*\}\}/g, '')
    .replace(/\{\{\/if\}\}/g, '')
    .replace(/\{\{else\}\}/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && /\{\{(char|description|personality|scenario)\}\}/.test(line))
    .join('\n');
}

export type ImportedPreset = {
  name: string;
  system: string;
  jailbreak: string;
  params: PresetParams;
  contextTemplate: string;
  instruct: PresetInstruct;
  order: PromptOrderItem[];
  forbidOverrides: boolean;
};

// ST 预设导出：temperature / top_p / openai_max_tokens / prompts[] / prompt_order[]。
export function parseStPreset(input: unknown): ImportedPreset | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw) return null;
  const prompts = (Array.isArray(raw.prompts) ? raw.prompts : []).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  const systemPrompt = prompts.find((item) => item.system_prompt === true || item.identifier === 'main');
  const jailbreak = prompts.find((item) => /jailbreak/i.test(text(item.identifier) + text(item.name)));
  const builtin: Record<string, string> = {
    main: 'system',
    jailbreak: 'jailbreak',
    chatHistory: 'history',
    dialogueExamples: 'examples',
    worldInfoBefore: 'lore',
    charDescription: 'character',
    charPersonality: 'character',
    scenario: 'character',
    personaDescription: 'persona',
  };
  const extras = ['nsfw', 'enhanceDefinitions']
    .map((id) => prompts.find((item) => item.identifier === id))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => text(item.content).trim().length > 0);
  const orderSource = Array.isArray(raw.prompt_order)
    ? ((raw.prompt_order.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).character_id) === '100001') ?? raw.prompt_order[0]) as Record<string, unknown> | undefined)
    : undefined;
  const orderList = Array.isArray(orderSource?.order) ? (orderSource!.order as unknown[]) : [];
  const seen = new Set<string>();
  const order: PromptOrderItem[] = [];
  for (const item of orderList) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const key = builtin[text(entry.identifier)];
    if (!key || seen.has(key)) continue;
    seen.add(key);
    order.push({ key, enabled: entry.enabled !== false });
  }
  const params = normalizeParams({
    temperature: raw.temperature,
    topP: raw.top_p,
    topK: raw.top_k,
    minP: raw.min_p,
    typicalP: raw.typical_p,
    repetitionPenalty: raw.repetition_penalty ?? raw.rep_pen,
    repetitionPenaltyRange: raw.repetition_penalty_range ?? raw.rep_pen_range,
    repetitionPenaltySlope: raw.repetition_penalty_slope ?? raw.rep_pen_slope,
    presencePenalty: raw.presence_penalty ?? raw.presence_pen,
    frequencyPenalty: raw.frequency_penalty ?? raw.freq_pen,
    maxTokens: raw.openai_max_tokens ?? raw.max_tokens ?? raw.n_predict,
    contextSize: raw.openai_max_context ?? raw.max_context_length ?? raw.max_length,
    seed: raw.seed,
  });
  return {
    name: text(raw.name, text(raw.preset_name, '导入的预设')).slice(0, 60),
    system: [text(systemPrompt?.content, text(raw.system_prompt)), ...extras.map((item) => text(item.content))].filter(Boolean).join('\n\n'),
    jailbreak: text(jailbreak?.content),
    params,
    contextTemplate: convertStoryString(raw.story_string) || DEFAULT_CONTEXT_TEMPLATE,
    instruct: {
      enabled: Boolean(raw.input_sequence || raw.output_sequence || raw.system_sequence),
      input: text(raw.input_sequence),
      output: text(raw.output_sequence),
      system: text(raw.system_sequence),
      stop: text(raw.stop_sequence),
    },
    order: order.length ? normalizeOrder(order) : PROMPT_BLOCKS.map(([key]) => ({ key, enabled: key !== 'jailbreak' })),
    forbidOverrides: systemPrompt?.forbid_overrides === true,
  };
}

export function parseStWorldInfo(input: unknown): { name: string; entries: LoreEntry[] } | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw) return null;
  const source = raw.entries;
  const list = Array.isArray(source) ? source : source && typeof source === 'object' ? Object.values(source as Record<string, unknown>) : null;
  if (!list) return null;
  return {
    name: text(raw.name, text(raw.originalData && (raw.originalData as Record<string, unknown>).name, '导入的世界书')).slice(0, 60),
    entries: list.slice(0, 500).map((item, index) => normalizeLoreEntry(item, index)),
  };
}

export function parseStRegex(input: unknown): Omit<RegexRule, 'id' | 'sort'>[] | null {
  const raw = Array.isArray(input) ? input : input && typeof input === 'object' ? (input as Record<string, unknown>).regex_scripts : null;
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => {
      const placement = Array.isArray(item.placement) ? item.placement.map(Number) : [];
      const target: RegexTarget = placement.length
        ? placement.includes(1) && placement.includes(2)
          ? 'all'
          : placement.includes(2)
            ? 'assistant'
            : placement.includes(1)
              ? 'user'
              : 'all'
        : 'all';
      const scope: RegexScope = item.scope === 'display' || item.scope === 'send' ? item.scope : item.markdownOnly === true && item.promptOnly !== true ? 'display' : item.promptOnly === true && item.markdownOnly !== true ? 'send' : 'both';
      return {
        name: text(item.scriptName, text(item.name, '导入的规则')).slice(0, 60),
        find: text(item.findRegex, text(item.find, text(item.regex))),
        replacement: text(item.replaceString, text(item.replace)),
        scope,
        target,
        // 只作用于世界书(5)/推理(6)/斜杠命令(3)的规则不该套到消息上，导入后先停用（原样保留在 raw 里，导出不丢）
        enabled: item.disabled !== true && item.enabled !== false && !(placement.length > 0 && !placement.includes(1) && !placement.includes(2)),
        depthFrom: optionalInt(item.minDepth, -1, 9999),
        depthTo: optionalInt(item.maxDepth, 0, 9999),
        trim: Array.isArray(item.trimStrings) ? item.trimStrings.map(String).filter(Boolean).slice(0, 20) : [],
      };
    })
    .filter((rule) => rule.find);
}
