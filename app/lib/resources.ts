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
export type PromptRole = 'system' | 'user' | 'assistant';
/** ST Prompt Manager 的自定义条目：顺序里用 key = `p:<id>` 引用 */
export type PresetPrompt = {
  id: string;
  name: string;
  role: PromptRole;
  content: string;
  /** relative = 按顺序放在列表里；depth = 插进聊天记录（ST「聊天内」，injection_position 1） */
  position: 'relative' | 'depth';
  depth: number;
  /** 同深度同角色时的先后（ST injection_order，小的在前） */
  order: number;
  /** 只在这些生成类型时生效（ST injection_trigger），空 = 全部 */
  triggers: string[];
};
export const PROMPT_TRIGGERS = [
  ['normal', '普通发送'],
  ['continue', '继续'],
  ['impersonate', '代写'],
  ['swipe', '换一条候选'],
  ['regenerate', '重新生成'],
  ['quiet', '后台生成（/gen）'],
] as const;
export const promptKey = (id: string) => `p:${id}`;

export type Preset = {
  id: number;
  name: string;
  system: string;
  jailbreak: string;
  params: PresetParams;
  contextTemplate: string;
  instruct: PresetInstruct;
  order: PromptOrderItem[];
  prompts: PresetPrompt[];
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
  maxTokens: 1024,
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

const ROLES = new Set(['system', 'user', 'assistant']);
const TRIGGER_SET = new Set<string>(PROMPT_TRIGGERS.map(([key]) => key));

export function normalizePrompts(raw: unknown): PresetPrompt[] {
  const seen = new Set<string>();
  const out: PresetPrompt[] = [];
  for (const item of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    let id = text(source.id).trim().slice(0, 64).replace(/[^\w.-]/g, '-');
    if (!id || seen.has(id)) id = `c${out.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    const role = text(source.role);
    const depth = Number(source.depth);
    const order = Number(source.order);
    out.push({
      id,
      name: text(source.name).trim().slice(0, 80) || '未命名条目',
      role: (ROLES.has(role) ? role : 'system') as PromptRole,
      content: text(source.content).slice(0, 100_000),
      position: source.position === 'depth' ? 'depth' : 'relative',
      depth: Number.isFinite(depth) ? Math.max(0, Math.min(999, Math.round(depth))) : 4,
      order: Number.isFinite(order) ? Math.max(-9999, Math.min(9999, Math.round(order))) : 100,
      triggers: Array.isArray(source.triggers) ? [...new Set(source.triggers.map(String).filter((key) => TRIGGER_SET.has(key)))] : [],
    });
  }
  return out;
}

/** 生成类型是否命中条目的触发器（ST：空 = 全部；swipe 与 regenerate 互认） */
export function promptTriggered(prompt: Pick<PresetPrompt, 'triggers'>, type = 'normal'): boolean {
  if (!prompt.triggers.length) return true;
  if (prompt.triggers.includes(type)) return true;
  return (type === 'swipe' && prompt.triggers.includes('regenerate')) || (type === 'regenerate' && prompt.triggers.includes('swipe'));
}

// 块顺序：先保留调用方给的合法顺序（内置块 + 自定义条目 p:<id>），再把缺失的补进来：
// 内置块补在「最近消息」前面（后置提示补在最后），没出现在顺序里的自定义条目补在末尾且默认关闭。
export function normalizeOrder(raw: unknown, prompts: PresetPrompt[] = []): PromptOrderItem[] {
  const valid = new Set<string>([...PROMPT_BLOCKS.map(([key]) => key), ...prompts.map((prompt) => promptKey(prompt.id))]);
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
  for (const [key] of PROMPT_BLOCKS) {
    if (seen.has(key)) continue;
    const at = order.findIndex((item) => item.key === 'history');
    if (key === 'jailbreak' || key === 'history' || at < 0) order.push({ key, enabled: true });
    else order.splice(at, 0, { key, enabled: true });
  }
  for (const prompt of prompts) if (!seen.has(promptKey(prompt.id))) order.push({ key: promptKey(prompt.id), enabled: false });
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
    prompts: [],
    forbidOverrides: false,
  };
}

// ST 上下文模板（story_string）的 Handlebars 写法：{{#if x}}…{{else}}…{{/if}}、{{#unless x}}…{{/unless}}、{{trim}}。
// 认识的变量见 STORY_KEYS；不认识的 {{宏}}（{{user}}、{{random}}…）原样留给后面的宏替换。
export const STORY_KEYS = ['char', 'user', 'hook', 'description', 'personality', 'scenario', 'persona', 'legacy', 'instructions', 'system', 'wiBefore', 'wiAfter', 'loreBefore', 'loreAfter', 'mesExamples', 'mesExamplesRaw', 'anchorBefore', 'anchorAfter'] as const;

export function isHandlebarsTemplate(template: string): boolean {
  return /\{\{\s*[#/](if|unless)\b|\{\{\s*else\s*\}\}|\{\{\s*trim\s*\}\}/.test(template);
}

/** 模板里用到了哪些变量（用来决定对应的独立块要不要再出现，免得重复） */
export function templateUses(template: string, key: string): boolean {
  return new RegExp(`\\{\\{\\s*(?:#if\\s+|#unless\\s+)?${key}\\s*\\}\\}`).test(template);
}

function renderBlocks(source: string, values: Record<string, string>): string {
  const truthy = (key: string) => Boolean((values[key] ?? '').trim());
  const tag = /\{\{\s*(#if|#unless|else|\/if|\/unless)\s*([\w.]*)\s*\}\}/g;
  type Frame = { kind: 'if' | 'unless'; on: boolean; inElse: boolean; out: string };
  const stack: Frame[] = [];
  let out = '';
  let last = 0;
  const visible = () => stack.every((frame) => (frame.inElse ? !frame.on : frame.on));
  const emit = (chunk: string) => { if (visible()) out += chunk; };
  for (const match of source.matchAll(tag)) {
    emit(source.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;
    const [, kind, key] = match;
    if (kind === '#if' || kind === '#unless') stack.push({ kind: kind === '#if' ? 'if' : 'unless', on: kind === '#if' ? truthy(key) : !truthy(key), inElse: false, out: '' });
    else if (kind === 'else') { const top = stack[stack.length - 1]; if (top) top.inElse = true; }
    else stack.pop();
  }
  emit(source.slice(last));
  return out;
}

export function renderContextTemplate(template: string, values: Record<string, string>): string {
  const source = template.trim() ? template : DEFAULT_CONTEXT_TEMPLATE;
  if (isHandlebarsTemplate(source)) {
    const body = renderBlocks(source, values)
      .replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => ((STORY_KEYS as readonly string[]).includes(key) && key !== 'user' ? values[key] ?? '' : whole));
    // {{trim}}：去掉它两侧的空白（ST 常放在末尾吃掉最后的换行）
    return body.replace(/\s*\{\{\s*trim\s*\}\}\s*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return source
    .split('\n')
    .map((line) => {
      let replaced = line;
      let touched = false;
      for (const key of STORY_KEYS) {
        if (key === 'user' || !replaced.includes(`{{${key}}}`)) continue;
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
  // ST 定时效果（按消息条数）：黏性 = 触发后保持 N 条；冷却 = 结束后 N 条内不再触发；延迟 = 会话不足 N 条时不触发
  sticky?: number;
  cooldown?: number;
  delay?: number;
  // ST 包含组：同组同时命中只留一条（组优先 > 权重随机）；逗号分隔可属多组
  group?: string;
  groupOverride?: boolean;
  groupWeight?: number;
  useGroupScoring?: boolean;
  ignoreBudget?: boolean;
  delayUntilRecursion?: boolean;
  // ST 向量匹配（🔗 Vectorized）：开了「世界书向量匹配」后按语义相似度激活，关键词照常生效
  vectorized?: boolean;
  // 扫描/占预算的先后档（ST 插入策略）：数字小的先排；同档按优先级（order）高的先。由 resources-db 按来源填
  lane?: number;
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

function timedAndGroup(entry: Record<string, unknown>, extensions: Record<string, unknown>, pick: (...values: unknown[]) => unknown): Partial<LoreEntry> {
  const out: Partial<LoreEntry> = {};
  const sticky = optionalInt(pick(entry.sticky, extensions.sticky), 0, 1000);
  const cooldown = optionalInt(pick(entry.cooldown, extensions.cooldown), 0, 1000);
  const delay = optionalInt(pick(entry.delay, extensions.delay), 0, 1000);
  if (sticky) out.sticky = sticky;
  if (cooldown) out.cooldown = cooldown;
  if (delay) out.delay = delay;
  const group = pick(entry.group, extensions.group);
  if (typeof group === 'string' && group.trim()) {
    out.group = group.trim().slice(0, 200);
    if (pick(entry.groupOverride, extensions.group_override) === true) out.groupOverride = true;
    const weight = optionalInt(pick(entry.groupWeight, extensions.group_weight), 0, 10000);
    out.groupWeight = weight ?? 100;
    if (pick(entry.useGroupScoring, extensions.use_group_scoring) === true) out.useGroupScoring = true;
  }
  if (pick(entry.ignoreBudget, extensions.ignore_budget) === true) out.ignoreBudget = true;
  if (pick(entry.delayUntilRecursion, extensions.delay_until_recursion)) out.delayUntilRecursion = true;
  if (pick(entry.vectorized, extensions.vectorized) === true) out.vectorized = true;
  return out;
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
    ...timedAndGroup(entry, extensions, pick),
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

// ST persona_description_positions：IN_PROMPT / TOP_AN / BOTTOM_AN / AT_DEPTH / NONE
export type PersonaPosition = 'prompt' | 'anTop' | 'anBottom' | 'depth' | 'none';
export const PERSONA_POSITIONS: PersonaPosition[] = ['prompt', 'anTop', 'anBottom', 'depth', 'none'];

export type Persona = {
  id: number;
  name: string;
  description: string;
  position: PersonaPosition;
  depth: number;
  role: LoreRole;
  boundCharacters: string[];
  /** 头像（/media/...），没有时显示名字首字 */
  avatar: string | null;
  /** ST「默认身份」：没有会话锁定、没有角色绑定时用它 */
  isDefault: boolean;
  /** ST 身份世界书：用这个身份时总是参与扫描 */
  lorebookId: number | null;
};


// ---------- SillyTavern 导入 ----------

// ST 的 story_string 原样保留（Handlebars 由 renderContextTemplate 执行）；只剩空白就当没有
function convertStoryString(source: unknown): string {
  const value = text(source).trim();
  return value ? value.slice(0, 8000) : '';
}

export type ImportedPreset = {
  name: string;
  system: string;
  jailbreak: string;
  params: PresetParams;
  contextTemplate: string;
  instruct: PresetInstruct;
  order: PromptOrderItem[];
  prompts: PresetPrompt[];
  forbidOverrides: boolean;
};

// ST 预设导出：temperature / top_p / openai_max_tokens / prompts[] / prompt_order[]。
export function parseStPreset(input: unknown): ImportedPreset | null {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  if (!raw) return null;
  const prompts = (Array.isArray(raw.prompts) ? raw.prompts : []).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  const systemPrompt = prompts.find((item) => item.identifier === 'main');
  const jailbreak = prompts.find((item) => item.identifier === 'jailbreak');
  const builtin: Record<string, string> = {
    main: 'system',
    jailbreak: 'jailbreak',
    chatHistory: 'history',
    dialogueExamples: 'examples',
    worldInfoBefore: 'lore',
    worldInfoAfter: 'character',
    charDescription: 'character',
    charPersonality: 'character',
    scenario: 'character',
    personaDescription: 'persona',
  };
  // 其余条目（nsfw / enhanceDefinitions / 用户自建的）原样保留为自定义条目：角色、位置、深度、顺序、触发器都带上
  const custom: PresetPrompt[] = normalizePrompts(
    prompts
      .filter((item) => !builtin[text(item.identifier)] && item.marker !== true)
      .map((item) => ({
        id: text(item.identifier),
        name: text(item.name, text(item.identifier)),
        role: text(item.role, 'system'),
        content: text(item.content),
        position: Number(item.injection_position) === 1 ? 'depth' : 'relative',
        depth: item.injection_depth ?? 4,
        order: item.injection_order ?? 100,
        triggers: Array.isArray(item.injection_trigger) ? item.injection_trigger : [],
      })),
  );
  const idOf = new Map(prompts.map((item, index) => [text(item.identifier), custom.find((prompt) => prompt.id === text(item.identifier).slice(0, 64).replace(/[^\w.-]/g, '-'))?.id ?? `#${index}`]));
  const orderSource = Array.isArray(raw.prompt_order)
    ? ((raw.prompt_order.find((item) => item && typeof item === 'object' && String((item as Record<string, unknown>).character_id) === '100001') ?? raw.prompt_order[0]) as Record<string, unknown> | undefined)
    : undefined;
  const orderList: Record<string, unknown>[] = (Array.isArray(orderSource?.order) ? (orderSource!.order as unknown[]) : prompts.map((item) => ({ identifier: item.identifier, enabled: item.enabled !== false })))
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  const seen = new Set<string>();
  const order: PromptOrderItem[] = [];
  for (const entry of orderList) {
    const identifier = text(entry.identifier);
    const key = builtin[identifier] ?? (idOf.has(identifier) && custom.some((prompt) => prompt.id === idOf.get(identifier)) ? promptKey(idOf.get(identifier)!) : '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    order.push({ key, enabled: entry.enabled !== false });
  }
  // 本站导出的预设带着完整顺序（含自动摘要、记忆等 ST 没有的块）
  const tavern = (raw.extensions && typeof raw.extensions === 'object' ? (raw.extensions as Record<string, unknown>).tavern : null) as Record<string, unknown> | null;
  const tavernOrder = tavern && Array.isArray(tavern.order) ? normalizeOrder(tavern.order, custom) : null;
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
    system: text(systemPrompt?.content, text(raw.system_prompt)),
    jailbreak: text(jailbreak?.content),
    params,
    contextTemplate: convertStoryString(raw.story_string) || (tavern && typeof tavern.contextTemplate === 'string' && tavern.contextTemplate.trim() ? tavern.contextTemplate : DEFAULT_CONTEXT_TEMPLATE),
    instruct: tavern && tavern.instruct && typeof tavern.instruct === 'object' ? normalizeInstruct(tavern.instruct) : {
      enabled: Boolean(raw.input_sequence || raw.output_sequence || raw.system_sequence),
      input: text(raw.input_sequence),
      output: text(raw.output_sequence),
      system: text(raw.system_sequence),
      stop: text(raw.stop_sequence),
    },
    order: tavernOrder ?? (order.length ? normalizeOrder(order, custom) : normalizeOrder(PROMPT_BLOCKS.map(([key]) => ({ key, enabled: key !== 'jailbreak' })), custom)),
    prompts: custom,
    forbidOverrides: systemPrompt?.forbid_overrides === true,
  };
}

// 导出成 ST 聊天补全预设（prompts + prompt_order），ST 能直接导入；extensions.tavern 留本站的完整顺序
const ST_MARKERS: Record<string, [string, string][]> = {
  history: [['chatHistory', 'Chat History']],
  examples: [['dialogueExamples', 'Chat Examples']],
  lore: [['worldInfoBefore', 'World Info (before)']],
  character: [['charDescription', 'Char Description'], ['charPersonality', 'Char Personality'], ['scenario', 'Scenario'], ['worldInfoAfter', 'World Info (after)']],
  persona: [['personaDescription', 'Persona Description']],
};
export function toStPreset(preset: Omit<Preset, 'id'>): Record<string, unknown> {
  const stPrompts: Record<string, unknown>[] = [
    { identifier: 'main', name: 'Main Prompt', system_prompt: true, role: 'system', content: preset.system, marker: false, forbid_overrides: preset.forbidOverrides },
    { identifier: 'jailbreak', name: 'Post-History Instructions', system_prompt: true, role: 'system', content: preset.jailbreak, marker: false },
    ...Object.values(ST_MARKERS).flat().map(([identifier, name]) => ({ identifier, name, system_prompt: true, marker: true })),
    ...preset.prompts.map((prompt) => ({
      identifier: prompt.id,
      name: prompt.name,
      system_prompt: false,
      role: prompt.role,
      content: prompt.content,
      marker: false,
      injection_position: prompt.position === 'depth' ? 1 : 0,
      injection_depth: prompt.depth,
      injection_order: prompt.order,
      injection_trigger: prompt.triggers,
      forbid_overrides: false,
    })),
  ];
  const order: { identifier: string; enabled: boolean }[] = [];
  for (const item of preset.order) {
    if (item.key === 'system') order.push({ identifier: 'main', enabled: item.enabled });
    else if (item.key === 'jailbreak') order.push({ identifier: 'jailbreak', enabled: item.enabled });
    else if (item.key.startsWith('p:')) order.push({ identifier: item.key.slice(2), enabled: item.enabled });
    else for (const [identifier] of ST_MARKERS[item.key] ?? []) order.push({ identifier, enabled: item.enabled });
  }
  if (order.findIndex((item) => item.identifier === 'worldInfoAfter') < 0) order.push({ identifier: 'worldInfoAfter', enabled: true });
  const p = preset.params;
  return {
    name: preset.name,
    temperature: p.temperature,
    top_p: p.topP,
    top_k: p.topK,
    min_p: p.minP,
    typical_p: p.typicalP,
    repetition_penalty: p.repetitionPenalty,
    presence_penalty: p.presencePenalty,
    frequency_penalty: p.frequencyPenalty,
    openai_max_tokens: p.maxTokens,
    openai_max_context: p.contextSize || 32768,
    seed: p.seed,
    prompts: stPrompts,
    prompt_order: [{ character_id: 100001, order }],
    extensions: { tavern: { order: preset.order, contextTemplate: preset.contextTemplate, instruct: preset.instruct } },
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
