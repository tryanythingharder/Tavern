import { characterLoreEntries, characterRegexRules, parseCardLore } from '@/lib/card-extras';
import db from '@/lib/db';
import type { DbChat } from '@/lib/db';
import {
  DEFAULT_CONTEXT_TEMPLATE,
  defaultPreset,
  normalizeInstruct,
  normalizeLoreEntries,
  normalizeOrder,
  normalizeParams,
  normalizeRegexRule,
  text,
  type Lorebook,
  type LoreEntry,
  type Persona,
  type PersonaPosition,
  type Preset,
  type QuickReply,
  type RegexRule,
} from '@/lib/resources';

// ---------- 预设 ----------

type PresetRow = {
  id: number; name: string; system: string; jailbreak: string; params: string;
  context_template: string; instruct: string; prompt_order: string; forbid_overrides: number;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function presetFromRow(row: PresetRow): Preset {
  return {
    id: row.id,
    name: row.name,
    system: row.system,
    jailbreak: row.jailbreak,
    params: normalizeParams(parseJson(row.params, {})),
    contextTemplate: row.context_template || DEFAULT_CONTEXT_TEMPLATE,
    instruct: normalizeInstruct(parseJson(row.instruct, {})),
    order: normalizeOrder(parseJson(row.prompt_order, [])),
    forbidOverrides: row.forbid_overrides === 1,
  };
}

export function listPresets(userId: number): Preset[] {
  const rows = db.prepare('SELECT * FROM presets WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as PresetRow[];
  return rows.map(presetFromRow);
}

export function getPreset(userId: number, id: number): Preset | undefined {
  const row = db.prepare('SELECT * FROM presets WHERE id = ? AND user_id = ?').get(id, userId) as PresetRow | undefined;
  return row ? presetFromRow(row) : undefined;
}

export function ensureDefaultPreset(userId: number): Preset {
  const existing = db.prepare('SELECT * FROM presets WHERE user_id = ? ORDER BY id LIMIT 1').get(userId) as PresetRow | undefined;
  if (existing) return presetFromRow(existing);
  const preset = defaultPreset();
  const now = Date.now();
  const result = db.prepare(`INSERT INTO presets (user_id, name, system, jailbreak, params, context_template, instruct, prompt_order, forbid_overrides, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId, preset.name, preset.system, preset.jailbreak, JSON.stringify(preset.params), preset.contextTemplate,
    JSON.stringify(preset.instruct), JSON.stringify(preset.order), 0, now, now,
  );
  return { ...preset, id: Number(result.lastInsertRowid) };
}

export type PresetInput = {
  name?: string;
  system?: string;
  jailbreak?: string;
  params?: unknown;
  contextTemplate?: string;
  instruct?: unknown;
  order?: unknown;
  forbidOverrides?: boolean;
};

export function createPreset(userId: number, input: PresetInput): Preset {
  const base = defaultPreset();
  const now = Date.now();
  const result = db.prepare(`INSERT INTO presets (user_id, name, system, jailbreak, params, context_template, instruct, prompt_order, forbid_overrides, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId,
    text(input.name, base.name).slice(0, 60),
    input.system ?? base.system,
    input.jailbreak ?? base.jailbreak,
    JSON.stringify(normalizeParams(input.params ?? base.params)),
    input.contextTemplate?.trim() || base.contextTemplate,
    JSON.stringify(normalizeInstruct(input.instruct ?? base.instruct)),
    JSON.stringify(normalizeOrder(input.order ?? base.order)),
    input.forbidOverrides === true ? 1 : 0,
    now,
    now,
  );
  return getPreset(userId, Number(result.lastInsertRowid))!;
}

export function updatePreset(userId: number, id: number, input: PresetInput): Preset | undefined {
  const current = getPreset(userId, id);
  if (!current) return undefined;
  const next = {
    name: input.name !== undefined ? text(input.name, current.name).slice(0, 60) : current.name,
    system: input.system ?? current.system,
    jailbreak: input.jailbreak ?? current.jailbreak,
    params: normalizeParams(input.params ?? current.params),
    contextTemplate: (input.contextTemplate ?? current.contextTemplate).trim() || DEFAULT_CONTEXT_TEMPLATE,
    instruct: normalizeInstruct(input.instruct ?? current.instruct),
    order: normalizeOrder(input.order ?? current.order),
    forbidOverrides: input.forbidOverrides ?? current.forbidOverrides,
  };
  db.prepare(`UPDATE presets SET name = ?, system = ?, jailbreak = ?, params = ?, context_template = ?, instruct = ?, prompt_order = ?, forbid_overrides = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    next.name, next.system, next.jailbreak, JSON.stringify(next.params), next.contextTemplate,
    JSON.stringify(next.instruct), JSON.stringify(next.order), next.forbidOverrides ? 1 : 0, Date.now(), id, userId,
  );
  return getPreset(userId, id);
}

export function deletePreset(userId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM presets WHERE id = ? AND user_id = ?').run(id, userId);
  if (Number(result.changes) > 0) db.prepare('UPDATE chats SET preset_id = NULL WHERE preset_id = ? AND user_id = ?').run(id, userId);
  return Number(result.changes) > 0;
}

// ---------- 世界书 ----------

type LorebookRow = { id: number; name: string; entries: string; updated_at: number };

function lorebookFromRow(row: LorebookRow): Lorebook {
  return { id: row.id, name: row.name, entries: normalizeLoreEntries(parseJson(row.entries, [])), updated_at: row.updated_at };
}

export function listLorebooks(userId: number): Lorebook[] {
  const rows = db.prepare('SELECT id, name, entries, updated_at FROM lorebooks WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as LorebookRow[];
  return rows.map(lorebookFromRow);
}

export function getLorebook(userId: number, id: number): Lorebook | undefined {
  const row = db.prepare('SELECT id, name, entries, updated_at FROM lorebooks WHERE id = ? AND user_id = ?').get(id, userId) as LorebookRow | undefined;
  return row ? lorebookFromRow(row) : undefined;
}

export function createLorebook(userId: number, name: string, entries: unknown): Lorebook {
  const now = Date.now();
  const result = db.prepare('INSERT INTO lorebooks (user_id, name, entries, created_at, updated_at) VALUES (?,?,?,?,?)').run(userId, text(name, '新的世界书').slice(0, 60), JSON.stringify(normalizeLoreEntries(entries)), now, now);
  return getLorebook(userId, Number(result.lastInsertRowid))!;
}

export function updateLorebook(userId: number, id: number, input: { name?: string; entries?: unknown }): Lorebook | undefined {
  const current = getLorebook(userId, id);
  if (!current) return undefined;
  db.prepare('UPDATE lorebooks SET name = ?, entries = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    input.name !== undefined ? text(input.name, current.name).slice(0, 60) : current.name,
    JSON.stringify(input.entries !== undefined ? normalizeLoreEntries(input.entries) : current.entries),
    Date.now(),
    id,
    userId,
  );
  return getLorebook(userId, id);
}

export function deleteLorebook(userId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM lorebooks WHERE id = ? AND user_id = ?').run(id, userId);
  if (Number(result.changes) > 0) {
    // 从会话的绑定列表里移除，避免留下悬空 id
    const chats = db.prepare('SELECT id, lorebook_ids FROM chats WHERE user_id = ? AND lorebook_ids IS NOT NULL').all(userId) as { id: number; lorebook_ids: string }[];
    const update = db.prepare('UPDATE chats SET lorebook_ids = ? WHERE id = ?');
    for (const chat of chats) {
      const ids = parseJson<number[]>(chat.lorebook_ids, []).filter((value) => value !== id);
      update.run(JSON.stringify(ids), chat.id);
    }
  }
  return Number(result.changes) > 0;
}

// ---------- 正则 ----------

type RegexRow = {
  id: number; name: string; find: string; replacement: string; scope: string; target: string;
  enabled: number; depth_from: number | null; depth_to: number | null; sort: number;
};

function regexFromRow(row: RegexRow): RegexRule {
  return normalizeRegexRule({
    id: row.id,
    name: row.name,
    find: row.find,
    replacement: row.replacement,
    scope: row.scope,
    target: row.target,
    enabled: row.enabled === 1,
    depthFrom: row.depth_from,
    depthTo: row.depth_to,
    sort: row.sort,
  });
}

export function listRegexRules(userId: number): RegexRule[] {
  const rows = db.prepare('SELECT * FROM regex_rules WHERE user_id = ? ORDER BY sort, id').all(userId) as RegexRow[];
  return rows.map(regexFromRow);
}

export type RegexInput = {
  name?: string;
  find?: string;
  replacement?: string;
  scope?: string;
  target?: string;
  enabled?: boolean;
  depthFrom?: number | null;
  depthTo?: number | null;
};

export function createRegexRule(userId: number, input: RegexInput): RegexRule {
  const now = Date.now();
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM regex_rules WHERE user_id = ?').get(userId) as { next: number }).next;
  const result = db.prepare(`INSERT INTO regex_rules (user_id, name, find, replacement, scope, target, enabled, depth_from, depth_to, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId,
    text(input.name, '新的规则').slice(0, 60),
    text(input.find),
    text(input.replacement),
    input.scope === 'display' || input.scope === 'send' ? input.scope : 'both',
    input.target === 'assistant' || input.target === 'user' ? input.target : 'all',
    input.enabled === false ? 0 : 1,
    input.depthFrom ?? null,
    input.depthTo ?? null,
    sort,
    now,
    now,
  );
  const row = db.prepare('SELECT * FROM regex_rules WHERE id = ?').get(Number(result.lastInsertRowid)) as RegexRow;
  return regexFromRow(row);
}

export function updateRegexRule(userId: number, id: number, input: RegexInput): RegexRule | undefined {
  const row = db.prepare('SELECT * FROM regex_rules WHERE id = ? AND user_id = ?').get(id, userId) as RegexRow | undefined;
  if (!row) return undefined;
  const current = regexFromRow(row);
  db.prepare(`UPDATE regex_rules SET name = ?, find = ?, replacement = ?, scope = ?, target = ?, enabled = ?, depth_from = ?, depth_to = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    input.name !== undefined ? text(input.name, current.name).slice(0, 60) : current.name,
    input.find ?? current.find,
    input.replacement ?? current.replacement,
    input.scope === 'display' || input.scope === 'send' ? input.scope : input.scope === undefined ? current.scope : 'both',
    input.target === 'assistant' || input.target === 'user' ? input.target : input.target === undefined ? current.target : 'all',
    input.enabled === undefined ? (current.enabled ? 1 : 0) : input.enabled ? 1 : 0,
    input.depthFrom === undefined ? current.depthFrom : input.depthFrom,
    input.depthTo === undefined ? current.depthTo : input.depthTo,
    Date.now(),
    id,
    userId,
  );
  const updated = db.prepare('SELECT * FROM regex_rules WHERE id = ?').get(id) as RegexRow;
  return regexFromRow(updated);
}

export function deleteRegexRule(userId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM regex_rules WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}

// ---------- 身份 ----------

type PersonaRow = {
  id: number; name: string; description: string; position: string; depth: number; role: string; bound_characters: string;
};

function personaFromRow(row: PersonaRow): Persona {
  const positions: PersonaPosition[] = ['prompt', 'depth', 'none'];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    position: positions.includes(row.position as PersonaPosition) ? (row.position as PersonaPosition) : 'prompt',
    depth: row.depth,
    role: row.role === 'user' || row.role === 'assistant' ? row.role : 'system',
    boundCharacters: parseJson<string[]>(row.bound_characters, []).filter((value) => typeof value === 'string'),
  };
}

export function listPersonas(userId: number): Persona[] {
  const rows = db.prepare('SELECT * FROM personas WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as PersonaRow[];
  return rows.map(personaFromRow);
}

export function getPersona(userId: number, id: number): Persona | undefined {
  const row = db.prepare('SELECT * FROM personas WHERE id = ? AND user_id = ?').get(id, userId) as PersonaRow | undefined;
  return row ? personaFromRow(row) : undefined;
}

export type PersonaInput = {
  name?: string;
  description?: string;
  position?: string;
  depth?: number;
  role?: string;
  boundCharacters?: unknown;
};

function personaValues(input: PersonaInput, current?: Persona) {
  return {
    name: (input.name !== undefined ? text(input.name, current?.name ?? '') : current?.name ?? '旅人').trim().slice(0, 30) || '旅人',
    description: input.description ?? current?.description ?? '',
    position: input.position === 'depth' || input.position === 'none' ? input.position : input.position === 'prompt' ? 'prompt' : current?.position ?? 'prompt',
    depth: Number.isFinite(Number(input.depth)) ? Math.max(0, Math.min(999, Math.round(Number(input.depth)))) : current?.depth ?? 2,
    role: input.role === 'user' || input.role === 'assistant' ? input.role : input.role === 'system' ? 'system' : current?.role ?? 'system',
    boundCharacters: Array.isArray(input.boundCharacters) ? input.boundCharacters.filter((value): value is string => typeof value === 'string') : current?.boundCharacters ?? [],
  };
}

export function createPersona(userId: number, input: PersonaInput): Persona {
  const values = personaValues(input);
  const now = Date.now();
  const result = db.prepare('INSERT INTO personas (user_id, name, description, position, depth, role, bound_characters, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    userId, values.name, values.description, values.position, values.depth, values.role, JSON.stringify(values.boundCharacters), now, now,
  );
  return getPersona(userId, Number(result.lastInsertRowid))!;
}

export function updatePersona(userId: number, id: number, input: PersonaInput): Persona | undefined {
  const current = getPersona(userId, id);
  if (!current) return undefined;
  const values = personaValues(input, current);
  db.prepare('UPDATE personas SET name = ?, description = ?, position = ?, depth = ?, role = ?, bound_characters = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    values.name, values.description, values.position, values.depth, values.role, JSON.stringify(values.boundCharacters), Date.now(), id, userId,
  );
  return getPersona(userId, id);
}

export function deletePersona(userId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM personas WHERE id = ? AND user_id = ?').run(id, userId);
  if (Number(result.changes) > 0) db.prepare('UPDATE chats SET persona_id = NULL WHERE persona_id = ? AND user_id = ?').run(id, userId);
  return Number(result.changes) > 0;
}

// ---------- 快捷回复 ----------

type QuickReplyRow = { id: number; label: string; content: string; sort: number };

export function listQuickReplies(userId: number): QuickReply[] {
  // 转成普通对象：node:sqlite 返回的是 null 原型对象，不能直接传给客户端组件
  const rows = db.prepare('SELECT id, label, content, sort FROM quick_replies WHERE user_id = ? ORDER BY sort, id').all(userId) as QuickReplyRow[];
  return rows.map((row) => ({ id: row.id, label: row.label, content: row.content, sort: row.sort }));
}

export function createQuickReply(userId: number, label: string, content: string): QuickReply {
  const sort = (db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS next FROM quick_replies WHERE user_id = ?').get(userId) as { next: number }).next;
  const result = db.prepare('INSERT INTO quick_replies (user_id, label, content, sort, created_at) VALUES (?,?,?,?,?)').run(userId, text(label, '快捷回复').slice(0, 30), text(content), sort, Date.now());
  return { id: Number(result.lastInsertRowid), label: text(label, '快捷回复').slice(0, 30), content: text(content), sort };
}

export function deleteQuickReply(userId: number, id: number): boolean {
  return Number(db.prepare('DELETE FROM quick_replies WHERE id = ? AND user_id = ?').run(id, userId).changes) > 0;
}

// ---------- 会话设定 ----------

export type ChatSettings = { presetId: number | null; personaId: number | null; lorebookIds: number[] | null };

export function chatSettings(chat: DbChat): ChatSettings {
  let ids: number[] | null = null;
  if (chat.lorebook_ids) {
    ids = parseJson<number[]>(chat.lorebook_ids, []).filter((value) => Number.isInteger(value));
  }
  return { presetId: chat.preset_id ?? null, personaId: chat.persona_id ?? null, lorebookIds: ids };
}

export function updateChatSettings(userId: number, chatId: number, input: ChatSettings): boolean {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND user_id = ?').get(chatId, userId);
  if (!chat) return false;
  const presetId = input.presetId && getPreset(userId, input.presetId) ? input.presetId : null;
  const personaId = input.personaId && getPersona(userId, input.personaId) ? input.personaId : null;
  const lorebookIds = input.lorebookIds === null ? null : JSON.stringify((input.lorebookIds ?? []).filter((id) => Number.isInteger(id)));
  db.prepare('UPDATE chats SET preset_id = ?, persona_id = ?, lorebook_ids = ? WHERE id = ? AND user_id = ?').run(presetId, personaId, lorebookIds, chatId, userId);
  return true;
}

export type GenerationConfig = {
  preset: Preset;
  persona: Persona | null;
  loreEntries: LoreEntry[];
  regexRules: RegexRule[];
};

// 生成时一次性取齐：预设（会话指定 → 默认）、身份（会话指定 → 绑定该角色的身份）、
// 世界书（会话绑定；未绑定时用全部）、正则（该用户全部启用规则）。
// 房间没有单独的预设/世界书绑定：用默认预设 + 全部世界书 + 全部正则，身份取第一个。
export function loadRoomConfig(userId: number): GenerationConfig {
  return {
    preset: ensureDefaultPreset(userId),
    persona: listPersonas(userId)[0] ?? null,
    loreEntries: listLorebooks(userId).flatMap((book) => book.entries.filter((entry) => entry.enabled)),
    regexRules: listRegexRules(userId),
  };
}

export function loadGenerationConfig(userId: number, chat: DbChat): GenerationConfig {
  const preset = (chat.preset_id ? getPreset(userId, chat.preset_id) : undefined) ?? ensureDefaultPreset(userId);
  const personas = listPersonas(userId);
  const persona =
    (chat.persona_id ? personas.find((item) => item.id === chat.persona_id) : undefined) ??
    personas.find((item) => item.boundCharacters.includes(chat.character_id)) ??
    null;
  const settings = chatSettings(chat);
  const books = listLorebooks(userId);
  const selected = settings.lorebookIds === null ? books : books.filter((book) => settings.lorebookIds!.includes(book.id));
  return {
    preset,
    persona,
    // 角色卡自带的世界书和正则随角色生效
    loreEntries: [...characterLoreEntries(chat.character_id, parseCardLore(chat.card_lore)), ...selected.flatMap((book) => book.entries.filter((entry) => entry.enabled))],
    regexRules: [...characterRegexRules(chat.character_id), ...listRegexRules(userId)],
  };
}
