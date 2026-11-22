import db from '@/lib/db';
import { normalizeLoreEntries, parseStRegex, type LoreEntry, type LoreRole, type RegexRule } from '@/lib/resources';

// 外部制卡工具（CardForge、piney、St_cardPlus…）做出来的卡，平台表单装不下的部分都放这里：
//   book   卡内嵌世界书 character_book（随角色生效，不需要玩家另行导入）
//   regex  卡内正则脚本 extensions.regex_scripts（状态栏 / 美化常用）
//   depth  extensions.depth_prompt（角色深度提示）
//   raw    原始卡的 data 对象，导出时在它上面覆盖平台字段，做到无损往返
//   flags  卡里用到的扩展：酒馆助手脚本（lib/helper-scripts.ts，对话里沙盒运行）、MVU 变量（lib/mvu.ts 已支持）、HTML 美化
export type CardExtras = {
  spec: string;
  book: { name: string; entries: LoreEntry[] } | null;
  regex: Omit<RegexRule, 'id' | 'sort'>[];
  depth: { prompt: string; depth: number; role: LoreRole } | null;
  raw: Record<string, unknown> | null;
  flags: { helperScripts: number; mvu: boolean; html: boolean };
};

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const HTML_RE = /<(div|span|style|script|table|details|img|section|html|body|svg|button|link)\b/i;

export function emptyExtras(): CardExtras {
  return { spec: '', book: null, regex: [], depth: null, raw: null, flags: { helperScripts: 0, mvu: false, html: false } };
}

export function extractExtras(input: unknown): CardExtras {
  const out = emptyExtras();
  const root = isObj(input) ? input : {};
  const data = isObj(root.data) ? root.data : root;
  out.spec = typeof root.spec === 'string' ? root.spec : 'chara_card_v1';
  out.raw = data;
  const book = isObj(data.character_book) ? data.character_book : null;
  if (book) {
    const entries = normalizeLoreEntries(Array.isArray(book.entries) ? book.entries : isObj(book.entries) ? Object.values(book.entries) : []);
    if (entries.length) out.book = { name: typeof book.name === 'string' && book.name ? book.name.slice(0, 60) : '角色世界书', entries };
  }
  const ext = isObj(data.extensions) ? data.extensions : {};
  out.regex = parseStRegex(ext) ?? [];
  const depth = isObj(ext.depth_prompt) ? ext.depth_prompt : null;
  if (depth && typeof depth.prompt === 'string' && depth.prompt.trim()) {
    const role = depth.role === 'user' || depth.role === 'assistant' ? depth.role : 'system';
    out.depth = { prompt: depth.prompt.slice(0, 20000), depth: Math.max(0, Math.min(999, Number(depth.depth) || 4)), role };
  }
  const helper = (isObj(ext.TavernHelper_scripts) ? Object.values(ext.TavernHelper_scripts) : Array.isArray(ext.TavernHelper_scripts) ? ext.TavernHelper_scripts : [])
    .concat(isObj(ext.tavern_helper) && Array.isArray((ext.tavern_helper as Obj).scripts) ? ((ext.tavern_helper as Obj).scripts as unknown[]) : []);
  out.flags.helperScripts = helper.length;
  const blob = JSON.stringify(data).slice(0, 2_000_000);
  out.flags.mvu = /stat_data|initvar|\[InitVar\]|MagVarUpdate|_\.set\(/i.test(blob);
  out.flags.html = HTML_RE.test(blob);
  return out;
}

export function saveExtras(characterId: string, extras: CardExtras): void {
  db.prepare('UPDATE characters SET card_extras = ? WHERE id = ?').run(JSON.stringify(extras), characterId);
}

export function loadExtras(characterId: string): CardExtras {
  const row = db.prepare('SELECT card_extras FROM characters WHERE id = ?').get(characterId) as { card_extras: string | null } | undefined;
  if (!row?.card_extras) return emptyExtras();
  try {
    return { ...emptyExtras(), ...(JSON.parse(row.card_extras) as Partial<CardExtras>) };
  } catch {
    return emptyExtras();
  }
}

// 卡内正则：id 取负数，和玩家自建规则区分（负 id 的规则照 ST 尊重原 flags）
export function characterRegexRules(characterId: string): RegexRule[] {
  return loadExtras(characterId).regex.map((rule, index) => ({ ...rule, id: -(index + 1), sort: -1000 + index }));
}

export type CardLoreOverrides = Record<string, boolean>;

export function parseCardLore(raw: string | null | undefined): CardLoreOverrides {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, on]) => typeof on === 'boolean')) as CardLoreOverrides;
  } catch {
    return {};
  }
}

// overrides：会话里玩家改过的开关，没改过的照卡默认
export function characterLoreEntries(characterId: string, overrides: CardLoreOverrides = {}): LoreEntry[] {
  return (loadExtras(characterId).book?.entries ?? [])
    .filter((entry) => overrides[entry.id] ?? entry.enabled)
    .map((entry) => ({ ...entry, enabled: true, id: `card-${entry.id}` }));
}

// 设置面板用：卡内条目清单（不带正文，只给前 80 字预览）
export function cardLoreList(characterId: string, overrides: CardLoreOverrides = {}) {
  return (loadExtras(characterId).book?.entries ?? []).map((entry) => ({
    id: entry.id,
    title: entry.title || entry.keywords.slice(0, 3).join(' / ') || `#${entry.id}`,
    preview: entry.text.replace(/\s+/g, ' ').slice(0, 80),
    trigger: entry.constant ? 'constant' as const : 'keyword' as const,
    keywords: entry.keywords.slice(0, 4),
    defaultOn: entry.enabled,
    on: overrides[entry.id] ?? entry.enabled,
  }));
}

// 只留和卡默认不同的开关；条目已不存在的丢掉
export function normalizeCardLore(characterId: string, wanted: CardLoreOverrides): CardLoreOverrides {
  const entries = loadExtras(characterId).book?.entries ?? [];
  const out: CardLoreOverrides = {};
  for (const entry of entries) {
    const value = wanted[entry.id];
    if (typeof value === 'boolean' && value !== entry.enabled) out[entry.id] = value;
  }
  return out;
}

export function extrasSummary(extras: CardExtras) {
  return {
    loreEntries: extras.book?.entries.length ?? 0,
    regexScripts: extras.regex.length,
    depthPrompt: Boolean(extras.depth),
    helperScripts: extras.flags.helperScripts,
    mvu: extras.flags.mvu,
    html: extras.flags.html,
  };
}
