import type { ChatMessage } from '@/lib/model';
import type { DbCharacter, DbMessage } from '@/lib/db';
import type { CharacterOverride } from '@/lib/cards';
import {
  PROMPT_BLOCKS,
  PROMPT_CHAR_BUDGET,
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
};

export type AssembleResult = {
  messages: ChatMessage[];
  blocks: PromptBlock[];
  text: string;
  chars: number;
  tokens: number;
  dropped: number;
  loreHits: { title: string; keys: string[] }[];
  params: PresetParams;
  stop: string[];
};

// ---------- 正则 ----------

const REGEX_TEXT_LIMIT = 20000;

function compileRule(rule: RegexRule): RegExp | null {
  const raw = rule.find;
  if (!raw) return null;
  const literal = raw.match(/^\/([^]*)\/([a-z]*)$/);
  try {
    if (literal) {
      const flags = [...new Set(literal[2].split('').filter((char) => 'gimsuy'.includes(char)))].join('');
      if (!literal[1]) return null;
      return new RegExp(literal[1], flags.includes('g') ? flags : `${flags}g`);
    }
    return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  } catch {
    return null;
  }
}

export function applyRegex(
  rules: RegexRule[],
  text: string,
  options: { target: 'user' | 'assistant'; purpose: 'send' | 'display'; depth?: number },
): string {
  let value = String(text ?? '');
  if (value.length > REGEX_TEXT_LIMIT) value = value.slice(0, REGEX_TEXT_LIMIT);
  for (const rule of rules) {
    if (!rule.enabled || !rule.find) continue;
    if (rule.scope !== 'both' && rule.scope !== options.purpose) continue;
    if (rule.target !== 'all' && rule.target !== options.target) continue;
    if (typeof options.depth === 'number') {
      if (rule.depthFrom !== null && rule.depthFrom >= -1 && options.depth < rule.depthFrom) continue;
      if (rule.depthTo !== null && rule.depthTo >= 0 && options.depth > rule.depthTo) continue;
    }
    const regex = compileRule(rule);
    if (!regex) continue;
    try {
      value = value.replace(regex, rule.replacement);
    } catch {
      // 单条规则出错不影响整段文本
    }
  }
  return value;
}

// ---------- 世界书 ----------

type LoreScanOptions = { caseSensitive: boolean; matchWholeWords: boolean; recursive: boolean; scanDepth: number; trigger: string };

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
    ...options,
  };
  const active = entries.filter((entry) => entry.enabled).sort((a, b) => b.priority - a.priority);
  const base = scanTexts.slice(0, settings.scanDepth).join('\n');
  const activated: LoreEntry[] = [];
  const hitKeys = new Map<string, string[]>();
  const activatedIds = new Set<string>();
  let buffer = base;
  let budget = LORE_BUDGET;

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
  const triggered = input.trigger ?? 'normal';

  // 扫描文本：最近消息 + 角色设定 + 玩家身份（对应 ST 的 match_* 字段）
  const recent = history.slice(-Math.max(LORE_SCAN_DEPTH, 1));
  const scanTexts = recent.map((message) => `${message.role === 'user' ? (persona?.name || '你') : character.name}：${message.content}`);
  if (character.description) scanTexts.push(character.description);
  if (character.pace) scanTexts.push(character.pace);
  if (persona?.description) scanTexts.push(persona.description);

  const scan = scanLore(loreEntries, scanTexts, { trigger: triggered });
  const at = (position: LoreEntry['position']) => scan.entries.filter((entry) => entry.position === position);

  const blockText = (key: string): string => {
    switch (key) {
      case 'system':
        return overridePrompt(preset.system, input.card?.systemPrompt, !preset.forbidOverrides);
      case 'jailbreak':
        return overridePrompt(preset.jailbreak, input.card?.postHistory, !preset.forbidOverrides);
      case 'character':
        return [
          renderContextTemplate(preset.contextTemplate, {
            char: character.name,
            hook: character.hook,
            description: character.description,
            personality: '',
            scenario: '',
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
        const source = (input.card?.mesExample ?? '').trim();
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
    value
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
    if (item.enabled) reserved += text.length;
    blocks.push({ key: item.key, label, text, chars: text.length, enabled: item.enabled });
  }

  // 历史：按预算从最新往回取，最新一条无论多长都保留
  const historyBlock = blocks.find((block) => block.key === 'history');
  const instruct = preset.instruct;
  const prefixFor = (role: string) => (instruct.enabled ? (role === 'user' ? instruct.input : role === 'system' ? instruct.system : instruct.output) : '');
  const historyMessages: ChatMessage[] = [];
  let historyChars = 0;
  let dropped = 0;
  if (historyBlock?.enabled) {
    const budget = Math.max(PROMPT_CHAR_BUDGET - reserved, 0);
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
      if (kept.length && historyChars + content.length > budget) {
        dropped = index + 1;
        break;
      }
      kept.unshift({ role: message.role === 'user' ? 'user' : 'assistant', content });
      historyChars += content.length;
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
    historyMessages.splice(index, 0, ...ordered.map((item) => ({ role: item.role as ChatMessage['role'], content: item.text })));
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
    params: preset.params,
    stop: instruct.enabled && instruct.stop ? [instruct.stop] : [],
  };
}

type LoreRoleLike = 'system' | 'user' | 'assistant';
