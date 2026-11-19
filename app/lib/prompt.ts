import type { ChatMessage } from '@/lib/model';
import type { DbCharacter, DbMessage } from '@/lib/db';
import type { CharacterOverride } from '@/lib/cards';
import {
  PROMPT_BLOCKS,
  LORE_BUDGET,
  LORE_SCAN_DEPTH,
  renderContextTemplate,
  type LoreEntry,
  type Persona,
  type Preset,
  type PresetParams,
  type RegexRule,
} from '@/lib/resources';
import { estimateTokens } from '@/lib/usage';
import { parseCardFields } from '@/lib/characters';
import { getSetting } from '@/lib/settings';
import { modelContextTokens } from '@/lib/model-catalog';
import { resolveVariableMacros, type MvuState } from '@/lib/mvu';
import { expandStMacros } from '@/lib/st-macros';

// 上下文预算按 tokens 计，和 ST 一样：窗口 = 玩家预设里的「上下文长度」（0 = 跟随模型），但不超过模型自己的上限
// （后台模型广场填的「上下文」，如 200K）。模型没填上限时用后台 prompt.defaultContext（默认 32K）；
// 后台还可设 prompt.maxContext 给全站封顶（0 = 不封顶），防止有人把百万上下文跑满。
// 窗口里先扣掉回复上限 max_tokens 和固定块（设定、世界书等），剩下的给历史。
function settingNumber(key: string, fallback: number, min: number, max: number): number {
  const value = Number(getSetting(key, ''));
  return Number.isFinite(value) && value > 0 ? Math.max(min, Math.min(max, value)) : fallback;
}
const DEFAULT_CONTEXT = 32_000;

export type ContextWindow = {
  window: number;     // 本次实际使用的上下文长度（tokens）
  modelLimit: number; // 模型上限；0 = 后台没填，用的是默认值
  requested: number;  // 预设里填的上下文长度；0 = 跟随模型
  cap: number;        // 全站封顶；0 = 不封顶
};

export function contextWindow(model: string | null | undefined, requested: number): ContextWindow {
  const modelLimit = modelContextTokens(model);
  const cap = settingNumber('prompt.maxContext', 0, 1000, 10_000_000);
  const ceiling = modelLimit || settingNumber('prompt.defaultContext', DEFAULT_CONTEXT, 1000, 10_000_000);
  let window = requested > 0 ? Math.min(requested, ceiling) : ceiling;
  if (cap) window = Math.min(window, cap);
  return { window: Math.max(window, 1000), modelLimit, requested, cap };
}

// 世界书预算（字符）：后台 prompt.loreBudget 写死时用它，否则取窗口的 25%（ST 默认值），至少 12000 字
const loreBudgetFor = (window: number) => settingNumber('prompt.loreBudget', Math.max(LORE_BUDGET, 12000, Math.floor(window * 0.25)), 500, 4_000_000);

// 提示词组装：把原型的 assemblePrompt 语义搬到服务端。
// 块顺序来自预设；世界书按关键词扫描后进入「角色设定之前/之后/历史深度」等位置；
// 历史按字符预算截断；Instruct 开启时给历史加序列前缀并追加停止序列。

const BLOCK_LABELS = new Map<string, string>(PROMPT_BLOCKS.map(([key, label]) => [key, label]));

export type PromptBlock = { key: string; label: string; text: string; chars: number; enabled: boolean };

export type AssembleInput = {
  character: DbCharacter;
  history: DbMessage[];
  preset: Preset;
  persona: Persona | null;
  loreEntries: LoreEntry[];
  regexRules: RegexRule[];
  trigger?: 'normal' | 'regenerate';
  // M3：摘要、检索片段、手动记忆
  summary?: string;
  rag?: { role: string; text: string; index: number }[];
  memory?: string;
  // 角色卡覆盖（ST 的 system_prompt / post_history / mes_example / depth_prompt）
  card?: CharacterOverride | null;
  // 本次用的模型：决定上下文窗口
  model?: string | null;
  /** MVU 变量（lib/mvu-server.ts chatVariables），用于 {{get_message_variable::…}} 等宏 */
  variables?: MvuState | null;
};

export type AssembleResult = {
  messages: ChatMessage[];
  blocks: PromptBlock[];
  text: string;
  chars: number;
  tokens: number;
  dropped: number;
  loreHits: { title: string; keys: string[] }[];
  context: ContextWindow & { history: number; reserved: number };
  params: PresetParams;
  stop: string[];
};

// ---------- 正则 ----------
// 纯函数放在 lib/regex-apply.ts，客户端渲染也要用
import { applyRegex } from '@/lib/regex-apply';
export { applyRegex };

// ---------- 世界书 ----------

type LoreScanOptions = { caseSensitive: boolean; matchWholeWords: boolean; recursive: boolean; scanDepth: number; trigger: string; budget: number };

const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;

function keyMatches(haystack: string, keyword: string, caseSensitive: boolean, wholeWords: boolean): boolean {
  if (!keyword) return false;
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const key = caseSensitive ? keyword : keyword.toLowerCase();
  if (!wholeWords || CJK.test(key)) return hay.includes(key);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(hay);
}

export function scanLore(
  entries: LoreEntry[],
  scanTexts: string[],
  options: Partial<LoreScanOptions> = {},
): { entries: LoreEntry[]; hits: { title: string; keys: string[] }[] } {
  const settings: LoreScanOptions = {
    caseSensitive: false,
    matchWholeWords: false,
    recursive: true,
    scanDepth: LORE_SCAN_DEPTH,
    trigger: 'normal',
    budget: loreBudgetFor(DEFAULT_CONTEXT),
    ...options,
  };
  const active = entries.filter((entry) => entry.enabled).sort((a, b) => b.priority - a.priority);
  const base = scanTexts.slice(0, settings.scanDepth).join('\n');
  const activated: LoreEntry[] = [];
  const hitKeys = new Map<string, string[]>();
  const activatedIds = new Set<string>();
  let buffer = base;
  let budget = settings.budget;

  const activate = (entry: LoreEntry, keys: string[]) => {
    if (activatedIds.has(entry.id)) return false;
    const cost = entry.text.length;
    if (cost > budget && !entry.constant) return false;
    budget -= cost;
    activatedIds.add(entry.id);
    activated.push(entry);
    hitKeys.set(entry.id, keys);
    if (settings.recursive && !entry.preventRecursion) buffer += `\n${entry.text}`;
    return true;
  };

  // 常驻条目先占预算（优先级从高到低）
  for (const entry of active) if (entry.constant) activate(entry, ['常驻']);

  const maxPasses = settings.recursive ? 4 : 1;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let added = false;
    for (const entry of active) {
      if (activatedIds.has(entry.id)) continue;
      if (entry.excludeRecursion && pass > 0) continue;
      if (!entry.keywords.length) continue;
      const caseSensitive = entry.caseSensitive ?? settings.caseSensitive;
      const wholeWords = entry.matchWholeWords ?? settings.matchWholeWords;
      const primary = entry.keywords.find((keyword) => keyMatches(buffer, keyword, caseSensitive, wholeWords));
      if (!primary) continue;
      if (entry.selective && entry.secondaryKeywords.length) {
        const results = entry.secondaryKeywords.map((keyword) => keyMatches(buffer, keyword, caseSensitive, wholeWords));
        const passed =
          entry.logic === 'andAny'
            ? results.some(Boolean)
            : entry.logic === 'notAll'
              ? results.some((result) => !result)
              : entry.logic === 'notAny'
                ? !results.some(Boolean)
                : results.every(Boolean);
        if (!passed) continue;
      }
      if (entry.probability < 100 && Math.random() * 100 >= entry.probability) continue;
      if (activate(entry, [primary])) added = true;
    }
    if (!added) break;
  }

  return {
    entries: activated,
    hits: activated.map((entry) => ({ title: entry.title, keys: hitKeys.get(entry.id) ?? [] })),
  };
}

// ---------- 组装 ----------

function loreBlock(entries: LoreEntry[]): string {
  return entries.map((entry) => `【${entry.title}】${entry.text}`).join('\n');
}

// ST：角色卡的 system_prompt 覆盖预设主提示词，post_history_instructions 覆盖后置提示；
// 卡内可写 {{original}} 引用被覆盖的原文。预设可以「禁止覆盖」。
function overridePrompt(base: string, override: string | undefined, allowed: boolean): string {
  const value = (override ?? '').trim();
  if (!allowed || !value) return base;
  return value.replace(/\{\{original\}\}/gi, () => base);
}

export function assemblePrompt(input: AssembleInput): AssembleResult {
  const { character, history, preset, persona, loreEntries, regexRules } = input;
  // 作者写在卡里的高级字段；玩家自己的覆盖（/me/cards）优先
  const cardFields = parseCardFields(character.card_fields);
  const triggered = input.trigger ?? 'normal';

  // 扫描文本：最近消息 + 角色设定 + 玩家身份（对应 ST 的 match_* 字段）
  const recent = history.slice(-Math.max(LORE_SCAN_DEPTH, 1));
  const scanTexts = recent.map((message) => `${message.role === 'user' ? (persona?.name || '你') : character.name}：${message.content}`);
  if (character.description) scanTexts.push(character.description);
  if (character.pace) scanTexts.push(character.pace);
  if (cardFields.personality) scanTexts.push(cardFields.personality);
  if (cardFields.scenario) scanTexts.push(cardFields.scenario);
  if (persona?.description) scanTexts.push(persona.description);

  const ctx = contextWindow(input.model, preset.params.contextSize);
  const scan = scanLore(loreEntries, scanTexts, { trigger: triggered, budget: loreBudgetFor(ctx.window) });
  const at = (position: LoreEntry['position']) => scan.entries.filter((entry) => entry.position === position);

  const blockText = (key: string): string => {
    switch (key) {
      case 'system':
        return overridePrompt(preset.system, input.card?.systemPrompt?.trim() || cardFields.systemPrompt, !preset.forbidOverrides);
      case 'jailbreak':
        return overridePrompt(preset.jailbreak, input.card?.postHistory?.trim() || cardFields.postHistory, !preset.forbidOverrides);
      case 'character':
        return [
          renderContextTemplate(preset.contextTemplate, {
            char: character.name,
            hook: character.hook,
            description: character.description,
            personality: cardFields.personality,
            scenario: cardFields.scenario,
            legacy: '',
            instructions: character.pace,
          }),
          loreBlock(at('after')),
        ]
          .filter(Boolean)
          .join('\n');
      case 'persona':
        return persona ? [`【身份】${persona.name}`, persona.position === 'prompt' && persona.description ? `【说明】${persona.description}` : ''].filter(Boolean).join('\n') : '';
      case 'lore':
        // M2 还没有作者注释与出口宏：把 AN / EM / Outlet 位置的条目并入这个世界书块，避免条目被静默丢弃
        return loreBlock([...at('before'), ...at('anTop'), ...at('emTop'), ...at('anBottom'), ...at('emBottom'), ...at('outlet')]);
      case 'examples': {
        const source = ((input.card?.mesExample ?? '').trim() || cardFields.mesExample).trim();
        if (!source) return '';
        const normalized = /^<START>/i.test(source) ? source : `<START>\n${source}`;
        return normalized
          .split(/<START>/gi)
          .slice(1)
          .map((block) => block.trim())
          .filter(Boolean)
          .map((block) => `<START>\n${block}`)
          .join('\n');
      }
      case 'autosummary':
        return input.summary ?? '';
      case 'rag': {
        const chunks = input.rag ?? [];
        if (!chunks.length) return '';
        const speaker = character.name;
        return chunks.map((chunk) => `［更早的对话 · 第 ${chunk.index + 1} 条］${chunk.role === 'user' ? '你' : speaker}：${chunk.text}`).join('\n');
      }
      case 'memory':
        return input.memory ?? '';
      default:
        return '';
    }
  };

  const userName = persona?.name || '你';
  const resolveMacros = (value: string) =>
    expandStMacros(resolveVariableMacros(value, input.variables ?? null))
      .replace(/\{\{char\}\}/gi, character.name)
      .replace(/\{\{user\}\}/gi, userName)
      .replace(/\{\{persona\}\}/gi, userName);

  const blocks: PromptBlock[] = [];
  let reserved = 0;
  for (const item of preset.order) {
    const label = BLOCK_LABELS.get(item.key);
    if (!label) continue;
    if (item.key === 'history') {
      blocks.push({ key: 'history', label, text: '', chars: 0, enabled: item.enabled });
      continue;
    }
    const text = item.enabled ? resolveMacros(blockText(item.key)) : '';
    if (item.enabled && text) reserved += estimateTokens(text) + 4;
    blocks.push({ key: item.key, label, text, chars: text.length, enabled: item.enabled });
  }

  // 历史：按预算从最新往回取，最新一条无论多长都保留
  const historyBlock = blocks.find((block) => block.key === 'history');
  const instruct = preset.instruct;
  const prefixFor = (role: string) => (instruct.enabled ? (role === 'user' ? instruct.input : role === 'system' ? instruct.system : instruct.output) : '');
  const historyMessages: ChatMessage[] = [];
  let historyChars = 0;
  let historyTokens = 0;
  let dropped = 0;
  // 历史能用的 tokens = 窗口 − 回复上限 − 固定块；深度注入（世界书 @D 等）不大，留 5% 余量
  const historyBudget = Math.max(Math.floor(ctx.window * 0.95) - preset.params.maxTokens - reserved, 0);
  if (historyBlock?.enabled) {
    const budget = historyBudget;
    const kept: ChatMessage[] = [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (message.role === 'system') continue;
      const depth = history.length - 1 - index;
      const text = applyRegex(regexRules, message.content, {
        target: message.role === 'user' ? 'user' : 'assistant',
        purpose: 'send',
        depth,
      });
      const content = `${prefixFor(message.role)}${text}`;
      const cost = estimateTokens(content) + 4;
      if (kept.length && historyTokens + cost > budget) {
        dropped = index + 1;
        break;
      }
      kept.unshift({ role: message.role === 'user' ? 'user' : 'assistant', content });
      historyChars += content.length;
      historyTokens += cost;
    }
    historyMessages.push(...kept);
    historyBlock.chars = historyChars;
    historyBlock.text = kept.map((message) => message.content).join('\n');
  }

  // 插入历史深度：世界书 @D 与放在聊天内的玩家身份，深度 N = 倒数第 N 条之前
  const injections: { depth: number; role: LoreRoleLike; text: string }[] = [];
  for (const entry of at('depth')) {
    injections.push({ depth: entry.depth, role: entry.role, text: `［世界书 · ${entry.title}］${entry.text}` });
  }
  if (persona && persona.position === 'depth' && persona.description.trim()) {
    injections.push({ depth: persona.depth, role: persona.role, text: `［玩家身份］${persona.description.trim()}` });
  }
  if (input.card?.depthPrompt.trim()) {
    injections.push({ depth: input.card.depthDepth, role: input.card.depthRole, text: `［角色深度提示］${input.card.depthPrompt.trim()}` });
  }
  for (const depth of [...new Set(injections.map((item) => item.depth))].sort((a, b) => b - a)) {
    const group = injections.filter((item) => item.depth === depth);
    const index = Math.max(historyMessages.length - depth, 0);
    const ordered = (['system', 'user', 'assistant'] as const).flatMap((role) => group.filter((item) => item.role === role));
    historyMessages.splice(index, 0, ...ordered.map((item) => ({ role: item.role as ChatMessage['role'], content: resolveMacros(item.text) })));
  }

  // 拼最终消息：历史之前的块合成一条 system，历史之后的块（后置提示）单独跟在末尾
  const messages: ChatMessage[] = [];
  const systemParts: string[] = [];
  let passedHistory = false;
  for (const item of preset.order) {
    const block = blocks.find((candidate) => candidate.key === item.key);
    if (!block?.enabled || !block.text) continue;
    if (item.key === 'history') {
      if (systemParts.length) messages.push({ role: 'system', content: systemParts.join('\n\n') });
      systemParts.length = 0;
      messages.push(...historyMessages);
      passedHistory = true;
      continue;
    }
    const section = `### ${block.label}\n${block.text}`;
    if (passedHistory) messages.push({ role: 'system', content: section });
    else systemParts.push(section);
  }
  if (systemParts.length) messages.push({ role: 'system', content: systemParts.join('\n\n') });

  // 历史块被关掉时至少保留玩家最新一句话，否则模型没有可回应的内容
  if (!historyBlock?.enabled) {
    const lastUser = [...history].reverse().find((message) => message.role === 'user');
    if (lastUser) messages.push({ role: 'user', content: applyRegex(regexRules, lastUser.content, { target: 'user', purpose: 'send', depth: 0 }) });
  }

  const text = messages.map((message) => `${message.role}:\n${message.content}`).join('\n\n');
  return {
    messages,
    blocks,
    text,
    chars: blocks.reduce((sum, block) => sum + (block.enabled ? block.chars : 0), 0),
    tokens: messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0),
    dropped,
    loreHits: scan.hits,
    context: { ...ctx, history: historyBudget, reserved },
    params: preset.params,
    stop: instruct.enabled && instruct.stop ? [instruct.stop] : [],
  };
}

type LoreRoleLike = 'system' | 'user' | 'assistant';
