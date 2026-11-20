import db, { getCharacterById, type ChatBranchInfo, type DbCharacter } from '@/lib/db';
import { applyRegex, scanLore, summaryText } from '@/lib/prompt';
import type { RoomPromptMemory } from '@/lib/room-memory';
import { renderContextTemplate, type LoreEntry, type Persona, type Preset, type RegexRule } from '@/lib/resources';
import type { ChatMessage } from '@/lib/model';
import { characterLoreEntries, characterRegexRules } from '@/lib/card-extras';
import { parseOpenings } from '@/lib/characters';
import { resolveVariableMacros, type MvuState } from '@/lib/mvu';

// M4 房间/群聊：多个角色共享一段对话。发言者按策略挑选（自然/轮流/手动/随机池），
// 提示词里同时给出所有成员的人设，并要求本轮只以被选中的角色回应。

export type RoomStrategy = 'natural' | 'roundRobin' | 'manual' | 'pooled';

export type Room = {
  id: number;
  name: string;
  characterIds: string[];
  muted: string[];
  strategy: RoomStrategy;
  autoMode: boolean;
  speakerId: string | null;
  model: string | null;
  /** 锁定在这个群聊的身份（ST：persona 锁定到聊天），null = 按绑定/默认 */
  personaId: number | null;
  /** 分支/检查点来源（ST：从群聊某条消息分出） */
  parentRoomId: number | null;
  parentMessageId: number | null;
  isCheckpoint: boolean;
  createdAt: number;
  updatedAt: number;
};

export type RoomMessage = {
  id: number; roomId: number; role: 'user' | 'assistant'; speakerId: string | null; content: string; createdAt: number;
  /** ST 滑动换版：候选数与当前选中下标（没有候选时 1 / 0） */
  candidateCount: number; selected: number;
  /** 挂在这条消息上的检查点房间 */
  checkpoint: number | null;
  /** 玩家消息：发送时的身份名与头像 */
  personaName: string | null;
  personaAvatar: string | null;
};

type RoomRow = {
  id: number; name: string; character_ids: string; muted: string; strategy: string;
  auto_mode: number | null; speaker_id: string | null; model?: string | null; created_at: number; updated_at: number;
  parent_room_id?: number | null; parent_message_id?: number | null; is_checkpoint?: number | null; persona_id?: number | null;
};
type RoomMessageRow = {
  id: number; room_id: number; role: string; speaker_id: string | null; content: string; created_at: number;
  candidates?: string | null; selected?: number | null; checkpoint_room_id?: number | null; attachment?: string | null;
  persona_name?: string | null; persona_avatar?: string | null;
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const STRATEGIES: RoomStrategy[] = ['natural', 'roundRobin', 'manual', 'pooled'];

function fromRow(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    characterIds: parseJson<string[]>(row.character_ids, []).filter((value) => typeof value === 'string'),
    muted: parseJson<string[]>(row.muted, []).filter((value) => typeof value === 'string'),
    strategy: STRATEGIES.includes(row.strategy as RoomStrategy) ? (row.strategy as RoomStrategy) : 'natural',
    autoMode: row.auto_mode === 1,
    speakerId: row.speaker_id && parseJson<string[]>(row.character_ids, []).includes(row.speaker_id) ? row.speaker_id : null,
    model: row.model || null,
    personaId: row.persona_id ?? null,
    parentRoomId: row.parent_room_id ?? null,
    parentMessageId: row.parent_message_id ?? null,
    isCheckpoint: row.is_checkpoint === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listRooms(userId: number): (Room & { lastMessage: string | null })[] {
  const rows = db.prepare(`
        SELECT r.*, (SELECT content FROM room_messages m WHERE m.room_id = r.id ORDER BY m.id DESC LIMIT 1) AS last_message
        FROM rooms r WHERE r.user_id = ? ORDER BY r.updated_at DESC
    `).all(userId) as (RoomRow & { last_message: string | null })[];
  return rows.map((row) => ({ ...fromRow(row), lastMessage: row.last_message }));
}

export function getRoom(roomId: number, userId: number): Room | undefined {
  const row = db.prepare('SELECT * FROM rooms WHERE id = ? AND user_id = ?').get(roomId, userId) as RoomRow | undefined;
  return row ? fromRow(row) : undefined;
}

export function createRoom(userId: number, input: { name?: string; characterIds?: unknown; strategy?: string }): Room | null {
  const ids = Array.isArray(input.characterIds)
    ? [...new Set(input.characterIds.filter((value): value is string => typeof value === 'string' && Boolean(getCharacterById(value))))]
    : [];
  if (!ids.length) return null;
  const now = Date.now();
  const strategy = STRATEGIES.includes(input.strategy as RoomStrategy) ? (input.strategy as RoomStrategy) : 'natural';
  const result = db.prepare('INSERT INTO rooms (user_id, name, character_ids, muted, strategy, auto_mode, speaker_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    userId,
    String(input.name ?? '').trim().slice(0, 40) || '新的房间',
    JSON.stringify(ids),
    '[]',
    strategy,
    0,
    null,
    now,
    now,
  );
  const room = getRoom(Number(result.lastInsertRowid), userId) ?? null;
  if (room) insertRoomGreetings(room);
  return room;
}

export function updateRoom(
  userId: number,
  roomId: number,
  patch: { name?: string; characterIds?: unknown; muted?: unknown; strategy?: string; autoMode?: unknown; speakerId?: unknown },
): Room | undefined {
  const room = getRoom(roomId, userId);
  if (!room) return undefined;
  const nextIds = Array.isArray(patch.characterIds)
    ? [...new Set(patch.characterIds.filter((value): value is string => typeof value === 'string' && Boolean(getCharacterById(value))))]
    : room.characterIds;
  if (!nextIds.length) return undefined;
  const nextMuted = Array.isArray(patch.muted) ? patch.muted.filter((value): value is string => typeof value === 'string' && nextIds.includes(value)) : room.muted;
  const strategy = STRATEGIES.includes(patch.strategy as RoomStrategy) ? (patch.strategy as RoomStrategy) : room.strategy;
  const autoMode = typeof patch.autoMode === 'boolean' ? patch.autoMode : room.autoMode;
  const speakerId = typeof patch.speakerId === 'string' && nextIds.includes(patch.speakerId) && !nextMuted.includes(patch.speakerId)
    ? patch.speakerId
    : room.speakerId && nextIds.includes(room.speakerId) && !nextMuted.includes(room.speakerId) ? room.speakerId : null;
  db.prepare('UPDATE rooms SET name = ?, character_ids = ?, muted = ?, strategy = ?, auto_mode = ?, speaker_id = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(
    patch.name !== undefined ? String(patch.name).trim().slice(0, 40) || room.name : room.name,
    JSON.stringify(nextIds),
    JSON.stringify(nextMuted),
    strategy,
    autoMode ? 1 : 0,
    speakerId,
    Date.now(),
    roomId,
    userId,
  );
  return getRoom(roomId, userId);
}

export function deleteRoom(userId: number, roomId: number): boolean {
  const room = getRoom(roomId, userId);
  if (!room) return false;
  db.prepare('DELETE FROM room_messages WHERE room_id = ?').run(roomId);
  db.prepare('DELETE FROM rooms WHERE id = ? AND user_id = ?').run(roomId, userId);
  // 原房间上挂的检查点入口失效；子分支保留，只断开来源
  db.prepare('UPDATE room_messages SET checkpoint_room_id = NULL WHERE checkpoint_room_id = ?').run(roomId);
  db.prepare('UPDATE rooms SET parent_room_id = NULL WHERE parent_room_id = ? AND user_id = ?').run(roomId, userId);
  return true;
}

function candidatesOf(row: { candidates?: string | null; content: string }): string[] {
  const list = parseJson<unknown[]>(row.candidates ?? null, []).filter((value): value is string => typeof value === 'string');
  return list.length ? list : [row.content];
}

function messageFromRow(row: RoomMessageRow): RoomMessage {
  const count = candidatesOf(row).length;
  return {
    id: row.id,
    roomId: row.room_id,
    role: row.role === 'user' ? 'user' : 'assistant',
    speakerId: row.speaker_id,
    content: row.content,
    createdAt: row.created_at,
    candidateCount: count,
    selected: Math.min(Math.max(row.selected ?? 0, 0), count - 1),
    checkpoint: row.checkpoint_room_id ?? null,
    personaName: row.persona_name ?? null,
    personaAvatar: row.persona_avatar ?? null,
  };
}

export function listRoomMessages(roomId: number, limit = 200): RoomMessage[] {
  const rows = db.prepare('SELECT * FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?').all(roomId, limit) as RoomMessageRow[];
  return rows.map(messageFromRow).reverse();
}

export function getRoomMessage(roomId: number, messageId: number): RoomMessage | undefined {
  const row = db.prepare('SELECT * FROM room_messages WHERE id = ? AND room_id = ?').get(messageId, roomId) as RoomMessageRow | undefined;
  return row ? messageFromRow(row) : undefined;
}

export function isLatestRoomMessage(roomId: number, messageId: number): boolean {
  const row = db.prepare('SELECT MAX(id) AS id FROM room_messages WHERE room_id = ?').get(roomId) as { id: number | null };
  return row.id === messageId;
}

export function addRoomMessage(roomId: number, role: 'user' | 'assistant', speakerId: string | null, content: string, sender?: { name: string; avatar: string | null } | null): RoomMessage {
  const now = Date.now();
  const personaName = sender?.name ?? null;
  const personaAvatar = sender?.avatar ?? null;
  const result = db.prepare('INSERT INTO room_messages (room_id, role, speaker_id, content, persona_name, persona_avatar, created_at) VALUES (?,?,?,?,?,?,?)').run(roomId, role, speakerId, content, personaName, personaAvatar, now);
  db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, roomId);
  return { id: Number(result.lastInsertRowid), roomId, role, speakerId, content, createdAt: now, candidateCount: 1, selected: 0, checkpoint: null, personaName, personaAvatar };
}

/**
 * ST 群聊开场：聊天为空时，按成员顺序把每位（未静音、有开场白的）成员的开场白各插一条；
 * 备选开场白作为这条的候选，可左右切换（同单聊）。宏在显示/组装时按该成员解析。
 * 返回插入条数；房间不空时什么都不做。
 */
export function insertRoomGreetings(room: Room): number {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM room_messages WHERE room_id = ?').get(room.id) as { n: number }).n;
  if (count > 0) return 0;
  const insert = db.prepare('INSERT INTO room_messages (room_id, role, speaker_id, content, candidates, selected, created_at) VALUES (?,?,?,?,?,?,?)');
  let inserted = 0;
  const now = Date.now();
  for (const id of room.characterIds) {
    if (room.muted.includes(id)) continue;
    const character = getCharacterById(id);
    if (!character) continue;
    const greetings = [character.greeting, ...parseOpenings(character.alternate_greetings).map((item) => item.text)].filter((text) => text && text.trim());
    if (!greetings.length) continue;
    insert.run(room.id, 'assistant', id, greetings[0], greetings.length > 1 ? JSON.stringify(greetings) : null, 0, now + inserted);
    inserted += 1;
  }
  if (inserted) db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, room.id);
  return inserted;
}

export function deleteRoomMessage(messageId: number): void {
  db.prepare('DELETE FROM room_messages WHERE id = ?').run(messageId);
}

function rawRoomMessage(messageId: number): RoomMessageRow | undefined {
  return db.prepare('SELECT * FROM room_messages WHERE id = ?').get(messageId) as RoomMessageRow | undefined;
}

/** 编辑：改正文，同时改当前候选（ST 编辑只动当前这一版） */
export function editRoomMessage(messageId: number, content: string): void {
  const row = rawRoomMessage(messageId);
  if (!row) return;
  const list = candidatesOf(row);
  const index = Math.min(Math.max(row.selected ?? 0, 0), list.length - 1);
  list[index] = content;
  db.prepare('UPDATE room_messages SET content = ?, candidates = ? WHERE id = ?').run(content, list.length > 1 ? JSON.stringify(list) : null, messageId);
}

/** 重新生成：新回复作为一个候选追加并选中（ST swipe 右滑到尽头） */
export function addRoomCandidate(messageId: number, content: string): { index: number; count: number } {
  const row = rawRoomMessage(messageId);
  if (!row) return { index: 0, count: 1 };
  const list = [...candidatesOf(row), content];
  db.prepare('UPDATE room_messages SET content = ?, candidates = ?, selected = ? WHERE id = ?').run(content, JSON.stringify(list), list.length - 1, messageId);
  return { index: list.length - 1, count: list.length };
}

export function selectRoomCandidate(messageId: number, index: number): RoomMessage | undefined {
  const row = rawRoomMessage(messageId);
  if (!row) return undefined;
  const list = candidatesOf(row);
  if (index < 0 || index >= list.length) return undefined;
  db.prepare('UPDATE room_messages SET content = ?, candidates = ?, selected = ? WHERE id = ?').run(list[index], JSON.stringify(list), index, messageId);
  return getRoomMessage(row.room_id, messageId);
}

/**
 * ST 群聊分支/检查点：复制房间设置（成员/静音/调度/自动推进/模型）和截至该消息的楼层（含候选）。
 * 检查点挂在原消息上，再点就直接打开。变量按楼层重放，所以不用另外复制。
 */
export function branchRoom(userId: number, roomId: number, messageId: number, checkpoint = false): Room | undefined {
  const room = getRoom(roomId, userId);
  const target = room ? rawRoomMessage(messageId) : undefined;
  if (!room || !target || target.room_id !== roomId) return undefined;
  if (checkpoint && target.checkpoint_room_id) {
    const existing = getRoom(target.checkpoint_room_id, userId);
    if (existing) return existing;
  }
  const now = Date.now();
  const tx = () => {
    const created = db.prepare(`INSERT INTO rooms (user_id, name, character_ids, muted, strategy, auto_mode, speaker_id, model, persona_id, parent_room_id, parent_message_id, is_checkpoint, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      userId,
      `${room.name.slice(0, 30)} · ${checkpoint ? '检查点' : '分支'}`,
      JSON.stringify(room.characterIds),
      JSON.stringify(room.muted),
      room.strategy,
      room.autoMode ? 1 : 0,
      room.speakerId,
      room.model,
      room.personaId,
      roomId,
      messageId,
      checkpoint ? 1 : 0,
      now,
      now,
    );
    const newId = Number(created.lastInsertRowid);
    db.prepare(`INSERT INTO room_messages (room_id, role, speaker_id, content, candidates, selected, attachment, persona_name, persona_avatar, created_at)
      SELECT ?, role, speaker_id, content, candidates, selected, attachment, persona_name, persona_avatar, created_at FROM room_messages WHERE room_id = ? AND id <= ? ORDER BY id`).run(newId, roomId, messageId);
    if (checkpoint) db.prepare('UPDATE room_messages SET checkpoint_room_id = ? WHERE id = ?').run(newId, messageId);
    // 作者注释 / 摘要设置跟着走；摘要只在没覆盖到分支点之后时才复制（同单聊分支）
    const source = db.prepare('SELECT author_note, summary, summary_prefs FROM rooms WHERE id = ?').get(roomId) as { author_note: string | null; summary: string | null; summary_prefs: string | null };
    const copied = (db.prepare('SELECT COUNT(*) AS n FROM room_messages WHERE room_id = ?').get(newId) as { n: number }).n;
    const covered = Number(parseJson<{ covered?: number }>(source.summary, {}).covered) || 0;
    db.prepare('UPDATE rooms SET author_note = ?, summary_prefs = ?, summary = ? WHERE id = ?').run(source.author_note, source.summary_prefs, covered <= copied ? source.summary : null, newId);
    return newId;
  };
  db.exec('BEGIN');
  try {
    const newId = tx();
    db.exec('COMMIT');
    return getRoom(newId, userId);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** 顶部分支导航：来源房间 + 从这里分出的分支/检查点（形状同单聊 ChatBranchInfo） */
export function roomFamily(userId: number, room: Room): ChatBranchInfo {
  const indexIn = (roomId: number, messageId: number | null) =>
    messageId ? ((db.prepare('SELECT COUNT(*) AS n FROM room_messages WHERE room_id = ? AND id <= ?').get(roomId, messageId) as { n: number }).n) : 0;
  const parentRow = room.parentRoomId ? (db.prepare('SELECT id, name FROM rooms WHERE id = ? AND user_id = ?').get(room.parentRoomId, userId) as { id: number; name: string } | undefined) : undefined;
  const children = db.prepare('SELECT id, name, is_checkpoint, parent_message_id, updated_at FROM rooms WHERE parent_room_id = ? AND user_id = ? ORDER BY id').all(room.id, userId) as { id: number; name: string; is_checkpoint: number; parent_message_id: number | null; updated_at: number }[];
  return {
    parent: parentRow ? { id: parentRow.id, title: parentRow.name, messageIndex: indexIn(parentRow.id, room.parentMessageId), exists: true } : null,
    children: children.map((row) => ({ id: row.id, title: row.name, checkpoint: row.is_checkpoint === 1, messageId: row.parent_message_id ?? 0, messageIndex: indexIn(room.id, row.parent_message_id), updatedAt: row.updated_at })),
  };
}

// 发言者调度：静音成员不参与；手动模式用指定的人；自然模式优先叫到名字的人，否则轮流。
export function pickSpeaker(room: Room, messages: RoomMessage[], userText: string, preferredId?: string | null): string | null {
  const members = room.characterIds.filter((id) => !room.muted.includes(id));
  if (!members.length) return null;
  if (room.strategy === 'manual') return preferredId && members.includes(preferredId) ? preferredId : members[0];
  if (room.strategy === 'pooled') return members[Math.floor(Math.random() * members.length)];

  const lastSpeaker = [...messages].reverse().find((message) => message.role === 'assistant')?.speakerId;
  if (room.strategy === 'natural') {
    const named = members.filter((id) => {
      const character = getCharacterById(id);
      return character && userText.includes(character.name);
    });
    if (named.length) return named.find((id) => id !== lastSpeaker) ?? named[0];
  }
  const counts = new Map(members.map((id) => [id, messages.filter((message) => message.speakerId === id).length]));
  const ordered = [...members].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
  return ordered.find((id) => id !== lastSpeaker) ?? ordered[0];
}

export type RoomPromptInput = {
  room: Room;
  messages: RoomMessage[];
  speaker: DbCharacter;
  preset: Preset;
  persona: Persona | null;
  /** {{user}}：身份名，没有身份时账号昵称 */
  userName?: string;
  loreEntries: LoreEntry[];
  regexRules: RegexRule[];
  /** 房间共享的 MVU 变量（lib/mvu-server.ts roomVariables） */
  variables?: MvuState | null;
  /** 群聊作者注释 + 记忆摘要（lib/room-memory.ts） */
  memory?: RoomPromptMemory | null;
  /** 本轮发言者的角色注释（ST：角色注释替换/拼接会话注释） */
  characterNoteText?: string;
};

export function buildRoomPrompt(input: RoomPromptInput): ChatMessage[] {
  const { room, messages, speaker, preset, persona, regexRules, variables, memory } = input;
  const summary = (memory?.summary ?? '').trim();
  const userName = input.userName || persona?.name || '你';
  const personaText = (persona?.description.trim() ?? '').replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, speaker.name);
  // 玩家消息用发送时的身份名（ST 每条消息的 name）
  const userOf = (message: RoomMessage) => message.personaName || userName;
  // 成员卡自带的世界书一起扫（InitVar 这类只给变量用的条目不进提示词）
  const cardLore = room.characterIds.flatMap((id) => characterLoreEntries(id)).filter((entry) => !/init_?var/i.test(entry.title));
  const loreEntries = [...cardLore, ...input.loreEntries];
  const macros = (value: string, charName = speaker.name) =>
    resolveVariableMacros(value, variables ?? null)
      .replace(/\{\{summary\}\}/gi, () => summary)
      .replace(/\{\{char\}\}/gi, charName)
      .replace(/\{\{user\}\}/gi, userName)
      .replace(/\{\{persona\}\}/gi, () => personaText);
  // 每个成员卡的「发送」正则只作用于该成员自己的楼层
  const sendRules = new Map(room.characterIds.map((id) => [id, characterRegexRules(id).filter((rule) => rule.enabled)]));
  const members = room.characterIds.map((id) => getCharacterById(id)).filter((character): character is DbCharacter => Boolean(character));
  const nameOf = (id: string | null) => (id ? getCharacterById(id)?.name ?? '角色' : '角色');
  const recent = messages.slice(-20);

  const blocks: string[] = [];
  blocks.push(`### 系统提示\n${preset.system}`);
  for (const character of members) {
    const card = renderContextTemplate(preset.contextTemplate, {
      char: character.name,
      hook: character.hook,
      description: character.description,
      personality: '',
      scenario: '',
      legacy: '',
      instructions: character.pace,
    });
    blocks.push(`### 角色 · ${character.name}\n${macros(card, character.name)}`);
  }

  const scanTexts = recent.map((message) => `${message.role === 'user' ? userOf(message) : nameOf(message.speakerId)}：${message.content}`);
  const messageCount = scanTexts.length;
  scanTexts.push(...members.map((character) => character.description));
  if (personaText) scanTexts.push(personaText);
  const scan = scanLore(loreEntries, scanTexts, { messageCount });
  if (scan.entries.length) blocks.push(`### 世界书命中\n${scan.entries.map((entry) => `【${entry.title}】${macros(entry.text)}`).join('\n')}`);
  if (summary && memory?.summaryPlacement.position === 'prompt') blocks.push(`### 前情摘要\n${summaryText(memory.summaryPlacement.template, summary)}`);
  // 身份说明按 ST 的位置：提示词里 / 作者注释顶部或底部 / 聊天内按深度 / 不进入
  if (persona) blocks.push(`### 玩家身份\n【身份】${userName}${personaText && persona.position === 'prompt' ? `\n${personaText}` : ''}`);

  blocks.push(
    [
      '### 本场规则',
      `这是多角色场景，玩家是「${userName}」。本轮发言人：${speaker.name}（其他角色这一轮不发言）。`,
      `只写 ${speaker.name} 的动作与台词；不要写其他角色的台词或动作，不要替玩家行动。`,
      `不要用「${speaker.name}：」这样的名字开头，直接写内容。`,
      '回复保持简短（一到三段），给其他人留出接话的空间。',
    ].join('\n'),
  );

  const history: ChatMessage[] = recent.map((message, index) => {
    const target = message.role === 'user' ? 'user' : 'assistant';
    const depth = recent.length - 1 - index;
    const rules = [...(message.speakerId ? sendRules.get(message.speakerId) ?? [] : []), ...regexRules];
    const content = applyRegex(rules, message.content, { target, purpose: 'send', depth, macros: { char: nameOf(message.speakerId), user: userName } });
    // 开场白等原文里的 {{char}} 按这条的发言者解析（ST 群聊开场白宏按各自角色替换）
    const who = message.role === 'user' ? userOf(message) : nameOf(message.speakerId);
    return { role: target, content: `${who}：${macros(content, message.role === 'user' ? speaker.name : who)}` };
  });

  // 作者注释（ST 默认聊天内 @4、system、每条玩家消息都插）与 @深度 摘要：按深度插进历史
  const note = memory?.authorNote;
  const baseNote = (input.characterNoteText ?? '').trim() || note?.text.trim() || '';
  const userTurns = recent.filter((message) => message.role === 'user').length;
  // 没有注释设置时按 ST 默认：每条都插、聊天内 @4、system
  const notePos = note ?? { position: 'depth' as const, depth: 4, role: 'system' as const, interval: 1 };
  const noteTurn = notePos.interval > 0 && userTurns % notePos.interval === 0;
  // ST：身份放「作者注释顶部/底部」时，在注释该插入的轮次拼到注释外侧（注释为空也插）
  const personaAn = persona && noteTurn && personaText && (persona.position === 'anTop' || persona.position === 'anBottom') ? personaText : '';
  const noteText = (persona?.position === 'anTop' ? [personaAn, noteTurn ? baseNote : ''] : [noteTurn ? baseNote : '', personaAn]).filter(Boolean).join('\n');
  const noteDue = Boolean(noteText);
  const injections: { depth: number; role: ChatMessage['role']; text: string }[] = [];
  if (noteDue && notePos.position === 'depth') injections.push({ depth: notePos.depth, role: notePos.role, text: noteText });
  if (persona && persona.position === 'depth' && personaText) injections.push({ depth: persona.depth, role: persona.role, text: personaText });
  if (summary && memory?.summaryPlacement.position === 'depth') injections.push({ depth: memory.summaryPlacement.depth, role: memory.summaryPlacement.role, text: summaryText(memory.summaryPlacement.template, summary) });
  for (const item of [...injections].sort((a, b) => b.depth - a.depth)) {
    history.splice(Math.max(history.length - item.depth, 0), 0, { role: item.role, content: macros(item.text) });
  }
  if (noteDue && notePos.position === 'before') blocks.unshift(`### 作者注释\n${noteText}`);
  if (noteDue && notePos.position === 'after') blocks.splice(Math.min(blocks.length, 1 + members.length), 0, `### 作者注释\n${noteText}`);

  return [{ role: 'system', content: macros(blocks.join('\n\n')) }, ...history];
}
