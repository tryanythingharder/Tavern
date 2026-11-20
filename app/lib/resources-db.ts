import { getGenPrefs, type LoreStrategy } from '@/lib/gen-prefs';
import { characterLoreEntries, characterRegexRules, parseCardLore } from '@/lib/card-extras';
import db from '@/lib/db';
import { saveMedia } from '@/lib/storage';
import type { DbChat } from '@/lib/db';
import {
  DEFAULT_CONTEXT_TEMPLATE,
  defaultPreset,
  normalizeInstruct,
  normalizeLoreEntries,
  normalizeOrder,
  normalizeParams,
  normalizePrompts,
  normalizeRegexRule,
  text,
  type Lorebook,
  type LoreEntry,
  type Persona,
  type PersonaPosition,
  PERSONA_POSITIONS,
  type Preset,
  type RegexRule,
} from '@/lib/resources';

// ---------- 预设 ----------

// ST Prompt Manager 自定义条目（JSON 数组）
if (!(db.prepare('PRAGMA table_info(presets)').all() as { name: string }[]).some((column) => column.name === 'prompts')) {
  db.exec("ALTER TABLE presets ADD COLUMN prompts TEXT NOT NULL DEFAULT '[]'");
}

type PresetRow = {
  id: number; name: string; system: string; jailbreak: string; params: string;
  context_template: string; instruct: string; prompt_order: string; forbid_overrides: number; prompts?: string | null;
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
    ...(() => {
      const prompts = normalizePrompts(parseJson(row.prompts, []));
      return { prompts, order: normalizeOrder(parseJson(row.prompt_order, []), prompts) };
    })(),
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
  prompts?: unknown;
  forbidOverrides?: boolean;
};

export function createPreset(userId: number, input: PresetInput): Preset {
  const base = defaultPreset();
  const now = Date.now();
  const prompts = normalizePrompts(input.prompts ?? []);
  const result = db.prepare(`INSERT INTO presets (user_id, name, system, jailbreak, params, context_template, instruct, prompt_order, forbid_overrides, created_at, updated_at, prompts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    userId,
    text(input.name, base.name).slice(0, 60),
    input.system ?? base.system,
    input.jailbreak ?? base.jailbreak,
    JSON.stringify(normalizeParams(input.params ?? base.params)),
    input.contextTemplate?.trim() || base.contextTemplate,
    JSON.stringify(normalizeInstruct(input.instruct ?? base.instruct)),
    JSON.stringify(normalizeOrder(input.order ?? base.order, prompts)),
    input.forbidOverrides === true ? 1 : 0,
    now,
    now,
    JSON.stringify(prompts),
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
    prompts: input.prompts !== undefined ? normalizePrompts(input.prompts) : current.prompts,
    order: [] as ReturnType<typeof normalizeOrder>,
    forbidOverrides: input.forbidOverrides ?? current.forbidOverrides,
  };
  next.order = normalizeOrder(input.order ?? current.order, next.prompts);
  db.prepare(`UPDATE presets SET name = ?, system = ?, jailbreak = ?, params = ?, context_template = ?, instruct = ?, prompt_order = ?, forbid_overrides = ?, prompts = ?, updated_at = ? WHERE id = ? AND user_id = ?`).run(
    next.name, next.system, next.jailbreak, JSON.stringify(next.params), next.contextTemplate,
    JSON.stringify(next.instruct), JSON.stringify(next.order), next.forbidOverrides ? 1 : 0, JSON.stringify(next.prompts), Date.now(), id, userId,
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
  avatar?: string | null; is_default?: number | null; lorebook_id?: number | null;
};

function personaFromRow(row: PersonaRow): Persona {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    position: PERSONA_POSITIONS.includes(row.position as PersonaPosition) ? (row.position as PersonaPosition) : 'prompt',
    depth: row.depth,
    role: row.role === 'user' || row.role === 'assistant' ? row.role : 'system',
    boundCharacters: parseJson<string[]>(row.bound_characters, []).filter((value) => typeof value === 'string'),
    avatar: typeof row.avatar === 'string' && row.avatar ? row.avatar : null,
    isDefault: row.is_default === 1,
    lorebookId: row.lorebook_id ?? null,
  };
}

// 默认身份排最前，其余按最近修改（列表顺序只用于显示，不再决定「用哪个身份」）
export function listPersonas(userId: number): Persona[] {
  const rows = db.prepare('SELECT * FROM personas WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC').all(userId) as PersonaRow[];
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
  avatar?: string | null;
  /** 新头像：data:image/...;base64（≤4MB），存成本人私有媒体 */
  avatarData?: string;
  isDefault?: boolean;
  lorebookId?: number | null;
};

function avatarFromDataUrl(userId: number, data: unknown): string | null {
  if (typeof data !== 'string') return null;
  const match = data.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) return null;
  return saveMedia(buffer, match[1] === 'jpeg' ? 'jpg' : match[1], { ownerId: userId, visibility: 'private' });
}

function personaValues(userId: number, input: PersonaInput, current?: Persona) {
  const lorebookId = input.lorebookId === null ? null
    : Number.isInteger(input.lorebookId) && getLorebook(userId, Number(input.lorebookId)) ? Number(input.lorebookId)
    : current?.lorebookId ?? null;
  // 头像只接受本站媒体地址（上传接口返回的 /media/...）
  const uploaded = avatarFromDataUrl(userId, input.avatarData);
  const avatar = uploaded ? uploaded
    : input.avatar === null ? null
    : typeof input.avatar === 'string' && /^\/media\/[a-zA-Z0-9-]+\.(png|jpe?g|webp|gif)$/.test(input.avatar) ? input.avatar
    : current?.avatar ?? null;
  return {
    name: (input.name !== undefined ? text(input.name, current?.name ?? '') : current?.name ?? '旅人').trim().slice(0, 30) || '旅人',
    description: (input.description ?? current?.description ?? '').slice(0, 20000),
    position: PERSONA_POSITIONS.includes(input.position as PersonaPosition) ? (input.position as PersonaPosition) : current?.position ?? 'prompt',
    depth: Number.isFinite(Number(input.depth)) ? Math.max(0, Math.min(999, Math.round(Number(input.depth)))) : current?.depth ?? 2,
    role: input.role === 'user' || input.role === 'assistant' ? input.role : input.role === 'system' ? 'system' : current?.role ?? 'system',
    boundCharacters: Array.isArray(input.boundCharacters) ? [...new Set(input.boundCharacters.filter((value): value is string => typeof value === 'string'))].slice(0, 500) : current?.boundCharacters ?? [],
    avatar,
    lorebookId,
    isDefault: typeof input.isDefault === 'boolean' ? input.isDefault : current?.isDefault ?? false,
  };
}

function applyDefault(userId: number, id: number, isDefault: boolean) {
  // 默认身份只能有一个（ST 的 default_persona）
  if (isDefault) db.prepare('UPDATE personas SET is_default = 0 WHERE user_id = ? AND id != ?').run(userId, id);
  db.prepare('UPDATE personas SET is_default = ? WHERE id = ? AND user_id = ?').run(isDefault ? 1 : 0, id, userId);
}

export function createPersona(userId: number, input: PersonaInput): Persona {
  const values = personaValues(userId, input);
  const now = Date.now();
  const result = db.prepare('INSERT INTO personas (user_id, name, description, position, depth, role, bound_characters, avatar, lorebook_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
    userId, values.name, values.description, values.position, values.depth, values.role, JSON.stringify(values.boundCharacters), values.avatar, values.lorebookId, now, now,
  );
  const id = Number(result.lastInsertRowid);
  // 第一个身份自动成为默认（ST 新建的第一个身份不会自动设默认；但这里没有「账号名」身份可退，默认一个更直观）
  const first = (db.prepare('SELECT COUNT(*) AS n FROM personas WHERE user_id = ?').get(userId) as { n: number }).n === 1;
  applyDefault(userId, id, values.isDefault || first);
  return getPersona(userId, id)!;
}

export function updatePersona(userId: number, id: number, input: PersonaInput): Persona | undefined {
  const current = getPersona(userId, id);
  if (!current) return undefined;
  const values = personaValues(userId, input, current);
  db.prepare('UPDATE personas SET name = ?, description = ?, position = ?, depth = ?, role = ?, bound_characters = ?, avatar = ?, lorebook_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    values.name, values.description, values.position, values.depth, values.role, JSON.stringify(values.boundCharacters), values.avatar, values.lorebookId, Date.now(), id, userId,
  );
  if (values.isDefault !== current.isDefault) applyDefault(userId, id, values.isDefault);
  // ST 换头像是覆盖同一个文件，旧消息也跟着变；这里把用旧头像（或这个身份名、当时没头像）发的消息改成新头像。改名不影响旧消息（同 ST）
  if (values.avatar !== current.avatar) {
    const params = current.avatar ? [values.avatar, current.avatar, userId] : [values.avatar, current.name, userId];
    const where = current.avatar ? 'persona_avatar = ?' : 'persona_avatar IS NULL AND persona_name = ?';
    db.prepare(`UPDATE messages SET persona_avatar = ? WHERE role = 'user' AND ${where} AND chat_id IN (SELECT id FROM chats WHERE user_id = ?)`).run(...params);
    db.prepare(`UPDATE room_messages SET persona_avatar = ? WHERE role = 'user' AND ${where} AND room_id IN (SELECT id FROM rooms WHERE user_id = ?)`).run(...params);
  }
  return getPersona(userId, id);
}

export function deletePersona(userId: number, id: number): boolean {
  const result = db.prepare('DELETE FROM personas WHERE id = ? AND user_id = ?').run(id, userId);
  if (Number(result.changes) > 0) {
    db.prepare('UPDATE chats SET persona_id = NULL WHERE persona_id = ? AND user_id = ?').run(id, userId);
    db.prepare('UPDATE rooms SET persona_id = NULL WHERE persona_id = ? AND user_id = ?').run(id, userId);
  }
  return Number(result.changes) > 0;
}

/**
 * 当前生效的身份，按 ST 的优先级：会话锁定 → 绑定了该角色（群聊：任一成员）的身份 → 默认身份。
 * 都没有时返回 null，玩家名退回账号昵称（ST 的 name1）。
 */
export function resolvePersona(userId: number, scope: { lockedId: number | null; characterIds: string[] }): Persona | null {
  const personas = listPersonas(userId);
  if (scope.lockedId) {
    const locked = personas.find((item) => item.id === scope.lockedId);
    if (locked) return locked;
  }
  return personas.find((item) => scope.characterIds.some((id) => item.boundCharacters.includes(id)))
    ?? personas.find((item) => item.isDefault)
    ?? null;
}

export function accountName(userId: number): string {
  const row = db.prepare('SELECT nickname FROM users WHERE id = ?').get(userId) as { nickname: string } | undefined;
  return row?.nickname?.trim() || '你';
}

/** 玩家消息记下发送时的身份（ST：每条消息的 name / force_avatar） */
export function personaSender(userId: number, persona: Persona | null): { name: string; avatar: string | null } {
  return { name: persona?.name || accountName(userId), avatar: persona?.avatar ?? null };
}

// ---------- ST 身份备份（Persona Management → Backup）互通 ----------
// 格式：{ personas: {头像文件: 名字}, persona_descriptions: {头像文件: {description, position, depth, role, lorebook, connections}}, default_persona }
// position：0 提示词里 / 1 角色之后（旧，按提示词里）/ 2 作者注释顶部 / 3 作者注释底部 / 4 聊天内 @深度 / 9 不进入；role：0 system 1 user 2 assistant
const ST_POSITION: Record<number, PersonaPosition> = { 0: 'prompt', 1: 'prompt', 2: 'anTop', 3: 'anBottom', 4: 'depth', 9: 'none' };
const ST_ROLE = ['system', 'user', 'assistant'] as const;

// 能连上的角色：自己的卡和聊过的角色（按名字匹配 ST 的 connections / 头像文件名）
export function linkableCharacters(userId: number): { id: string; name: string }[] {
  return db.prepare(`SELECT DISTINCT ch.id, ch.name FROM characters ch
    WHERE ch.owner_id = ? OR ch.id IN (SELECT character_id FROM chats WHERE user_id = ?)`).all(userId, userId) as { id: string; name: string }[];
}

export function importStPersonas(userId: number, raw: unknown): { created: number; skipped: number } {
  const data = (raw ?? {}) as { personas?: Record<string, unknown>; persona_descriptions?: Record<string, Record<string, unknown>>; default_persona?: unknown };
  if (!data.personas || typeof data.personas !== 'object') throw new Error('不是 SillyTavern 的身份备份（缺少 personas）');
  const books = listLorebooks(userId);
  const chars = linkableCharacters(userId);
  const existing = new Set(listPersonas(userId).map((item) => `${item.name}\u0000${item.description}`));
  let created = 0;
  let skipped = 0;
  for (const [file, nameValue] of Object.entries(data.personas)) {
    const meta = data.persona_descriptions?.[file] ?? {};
    const name = String(nameValue ?? '').trim() || file.replace(/\.[a-z]+$/i, '');
    const description = typeof meta.description === 'string' ? meta.description : '';
    if (existing.has(`${name.slice(0, 30)}\u0000${description}`)) { skipped += 1; continue; }
    const connections = Array.isArray(meta.connections) ? meta.connections as { type?: string; id?: string }[] : [];
    const bound = connections
      .filter((item) => item?.type === 'character' && typeof item.id === 'string')
      .map((item) => String(item.id).replace(/\.png$/i, ''))
      .flatMap((stem) => chars.filter((character) => character.name === stem).map((character) => character.id));
    const book = typeof meta.lorebook === 'string' && meta.lorebook ? books.find((item) => item.name === meta.lorebook) : undefined;
    createPersona(userId, {
      name,
      description,
      position: ST_POSITION[Number(meta.position)] ?? 'prompt',
      depth: Number(meta.depth ?? 2),
      role: ST_ROLE[Number(meta.role)] ?? 'system',
      boundCharacters: bound,
      lorebookId: book?.id ?? null,
      isDefault: data.default_persona === file,
    });
    created += 1;
  }
  return { created, skipped };
}

export function exportStPersonas(userId: number): Record<string, unknown> {
  const personas = listPersonas(userId);
  const positionCode: Record<PersonaPosition, number> = { prompt: 0, anTop: 2, anBottom: 3, depth: 4, none: 9 };
  const names = new Map(linkableCharacters(userId).map((character) => [character.id, character.name]));
  const books = new Map(listLorebooks(userId).map((book) => [book.id, book.name]));
  const key = (persona: Persona) => `tavern-${persona.id}.png`;
  return {
    personas: Object.fromEntries(personas.map((persona) => [key(persona), persona.name])),
    persona_descriptions: Object.fromEntries(personas.map((persona) => [key(persona), {
      description: persona.description,
      position: positionCode[persona.position],
      depth: persona.depth,
      role: ST_ROLE.indexOf(persona.role as (typeof ST_ROLE)[number]),
      lorebook: persona.lorebookId ? books.get(persona.lorebookId) ?? '' : '',
      connections: persona.boundCharacters.filter((id) => names.has(id)).map((id) => ({ type: 'character', id: `${names.get(id)}.png` })),
      title: '',
    }])),
    default_persona: personas.find((persona) => persona.isDefault) ? key(personas.find((persona) => persona.isDefault)!) : null,
  };
}

export function setRoomPersona(userId: number, roomId: number, personaId: number | null): boolean {
  const id = personaId && getPersona(userId, personaId) ? personaId : null;
  return Number(db.prepare('UPDATE rooms SET persona_id = ? WHERE id = ? AND user_id = ?').run(id, roomId, userId).changes) > 0;
}

export function setChatPersona(userId: number, chatId: number, personaId: number | null): boolean {
  const id = personaId && getPersona(userId, personaId) ? personaId : null;
  return Number(db.prepare('UPDATE chats SET persona_id = ? WHERE id = ? AND user_id = ?').run(id, chatId, userId).changes) > 0;
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
  /** {{user}}：身份名，没有身份时是账号昵称 */
  userName: string;
  loreEntries: LoreEntry[];
  /** 角色卡自带世界书的扫描档（ST 插入策略，见 laneRanks） */
  cardLoreLane: number;
  regexRules: RegexRule[];
};

// ---------- 世界书绑定（对齐 ST）----------
// 一次生成扫描的书 = 全局世界书（或会话自己选的一组）+ 角色附加世界书 + 聊天世界书 + 身份世界书，同一本只算一次。
// 全局：users.global_lorebooks，NULL = 全部（兼容旧版「默认用全部」），[] = 一本都不用。

export function globalLorebookIds(userId: number): number[] | null {
  const row = db.prepare('SELECT global_lorebooks FROM users WHERE id = ?').get(userId) as { global_lorebooks: string | null } | undefined;
  if (!row?.global_lorebooks) return null;
  return parseJson<number[]>(row.global_lorebooks, []).filter((value) => Number.isInteger(value));
}

/** 被某个聊天/群聊当作聊天世界书的书：「全部」不包括它们（ST 的聊天世界书不是全局书） */
export function chatBoundLorebookIds(userId: number): number[] {
  const rows = db.prepare(`SELECT chat_lorebook_id AS id FROM chats WHERE user_id = ? AND chat_lorebook_id IS NOT NULL
    UNION SELECT chat_lorebook_id AS id FROM rooms WHERE user_id = ? AND chat_lorebook_id IS NOT NULL`).all(userId, userId) as { id: number }[];
  return rows.map((row) => row.id);
}

export function setGlobalLorebookIds(userId: number, ids: number[] | null): void {
  const own = new Set(listLorebooks(userId).map((book) => book.id));
  const value = ids === null ? null : JSON.stringify([...new Set(ids)].filter((id) => own.has(id)));
  db.prepare('UPDATE users SET global_lorebooks = ? WHERE id = ?').run(value, userId);
}

export function characterLoreLinks(userId: number, characterId: string): number[] {
  const row = db.prepare('SELECT lorebook_ids FROM character_lore_links WHERE user_id = ? AND character_id = ?').get(userId, characterId) as { lorebook_ids: string } | undefined;
  return row ? parseJson<number[]>(row.lorebook_ids, []).filter((value) => Number.isInteger(value)) : [];
}

export function setCharacterLoreLinks(userId: number, characterId: string, ids: number[]): number[] {
  const own = new Set(listLorebooks(userId).map((book) => book.id));
  const clean = [...new Set(ids)].filter((id) => own.has(id));
  if (!clean.length) db.prepare('DELETE FROM character_lore_links WHERE user_id = ? AND character_id = ?').run(userId, characterId);
  else db.prepare(`INSERT INTO character_lore_links (user_id, character_id, lorebook_ids, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, character_id) DO UPDATE SET lorebook_ids = excluded.lorebook_ids, updated_at = excluded.updated_at`).run(userId, characterId, JSON.stringify(clean), Date.now());
  return clean;
}

/** 设定会话 / 群聊的聊天世界书；书不是自己的就清空 */
export function setChatLorebook(userId: number, target: 'chat' | 'room', id: number, lorebookId: number | null): boolean {
  const value = lorebookId && getLorebook(userId, lorebookId) ? lorebookId : null;
  const table = target === 'chat' ? 'chats' : 'rooms';
  const result = db.prepare(`UPDATE ${table} SET chat_lorebook_id = ? WHERE id = ? AND user_id = ?`).run(value, id, userId);
  return result.changes > 0;
}

export type BookSource = 'global' | 'chatPick' | 'character' | 'chat' | 'persona';

/** 这次生成要扫描哪些书，以及每本书为什么生效（设置面板展示用） */
export function activeLorebooks(userId: number, opts: { chatPick: number[] | null; characterIds: string[]; chatLorebookId: number | null; persona: Persona | null }): { book: Lorebook; sources: BookSource[] }[] {
  const books = listLorebooks(userId);
  const byId = new Map(books.map((book) => [book.id, book]));
  const out = new Map<number, BookSource[]>();
  const add = (id: number | null | undefined, source: BookSource) => {
    if (!id || !byId.has(id)) return;
    const list = out.get(id) ?? [];
    if (!list.includes(source)) list.push(source);
    out.set(id, list);
  };
  if (opts.chatPick !== null) opts.chatPick.forEach((id) => add(id, 'chatPick'));
  else {
    const global = globalLorebookIds(userId);
    const chatBound = new Set(chatBoundLorebookIds(userId));
    (global === null ? books.map((book) => book.id).filter((id) => !chatBound.has(id)) : global).forEach((id) => add(id, 'global'));
  }
  for (const characterId of opts.characterIds) characterLoreLinks(userId, characterId).forEach((id) => add(id, 'character'));
  add(opts.chatLorebookId, 'chat');
  add(opts.persona?.lorebookId ?? null, 'persona');
  return [...out.entries()].map(([id, sources]) => ({ book: byId.get(id)!, sources }));
}

// 条目 id 只在本书内唯一（ST 导入的书都是 0、1、2…），多本书一起扫时加书号前缀，免得互相顶掉
// lane 按 ST getSortedEntries：聊天世界书 0 → 身份世界书 1 → 角色/全局按插入策略（一本书有多个来源时取最靠前的）
export function laneRanks(strategy: LoreStrategy): Record<BookSource, number> {
  const character = strategy === 'global_first' ? 3 : 2;
  const global = strategy === 'character_first' ? 3 : 2;
  return { chat: 0, persona: 1, character, global, chatPick: global };
}
const enabledEntries = (list: { book: Lorebook; sources: BookSource[] }[], strategy: LoreStrategy) => {
  const ranks = laneRanks(strategy);
  return list.flatMap(({ book, sources }) => {
    const lane = Math.min(...sources.map((source) => ranks[source]));
    return book.entries.filter((entry) => entry.enabled).map((entry) => ({ ...entry, id: `b${book.id}:${entry.id}`, lane }));
  });
};

// 生成时一次性取齐：预设（会话指定 → 默认）、身份（会话锁定 → 绑定该角色 → 默认身份）、
// 世界书（见 activeLorebooks）、正则（该用户全部启用规则）。
// 房间没有单独的预设：用默认预设；世界书 = 全局 + 各成员的附加世界书 + 群聊世界书 + 身份世界书。
export function loadRoomConfig(userId: number, room?: { personaId: number | null; characterIds: string[]; chatLorebookId?: number | null }): GenerationConfig {
  const persona = resolvePersona(userId, { lockedId: room?.personaId ?? null, characterIds: room?.characterIds ?? [] });
  const books = activeLorebooks(userId, { chatPick: null, characterIds: room?.characterIds ?? [], chatLorebookId: room?.chatLorebookId ?? null, persona });
  const strategy = getGenPrefs(userId).loreStrategy;
  return {
    preset: ensureDefaultPreset(userId),
    persona,
    userName: persona?.name || accountName(userId),
    loreEntries: enabledEntries(books, strategy),
    cardLoreLane: laneRanks(strategy).character,
    regexRules: listRegexRules(userId),
  };
}

export function loadGenerationConfig(userId: number, chat: DbChat): GenerationConfig {
  const preset = (chat.preset_id ? getPreset(userId, chat.preset_id) : undefined) ?? ensureDefaultPreset(userId);
  const persona = resolvePersona(userId, { lockedId: chat.persona_id ?? null, characterIds: [chat.character_id] });
  const settings = chatSettings(chat);
  const books = activeLorebooks(userId, { chatPick: settings.lorebookIds, characterIds: [chat.character_id], chatLorebookId: chat.chat_lorebook_id ?? null, persona });
  const strategy = getGenPrefs(userId).loreStrategy;
  const ranks = laneRanks(strategy);
  return {
    preset,
    persona,
    userName: persona?.name || accountName(userId),
    // 角色卡自带的世界书和正则随角色生效
    loreEntries: [...characterLoreEntries(chat.character_id, parseCardLore(chat.card_lore)).map((entry) => ({ ...entry, lane: ranks.character })), ...enabledEntries(books, strategy)],
    cardLoreLane: ranks.character,
    regexRules: [...characterRegexRules(chat.character_id), ...listRegexRules(userId)],
  };
}
