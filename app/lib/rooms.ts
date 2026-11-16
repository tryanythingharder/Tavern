import db, { getCharacterById, type DbCharacter } from '@/lib/db';
import { applyRegex, scanLore } from '@/lib/prompt';
import { renderContextTemplate, type LoreEntry, type Persona, type Preset, type RegexRule } from '@/lib/resources';
import type { ChatMessage } from '@/lib/model';

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
  createdAt: number;
  updatedAt: number;
};

export type RoomMessage = { id: number; roomId: number; role: 'user' | 'assistant'; speakerId: string | null; content: string; createdAt: number };

type RoomRow = {
  id: number; name: string; character_ids: string; muted: string; strategy: string;
  auto_mode: number | null; speaker_id: string | null; model?: string | null; created_at: number; updated_at: number;
};
type RoomMessageRow = { id: number; room_id: number; role: string; speaker_id: string | null; content: string; created_at: number };

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
  return getRoom(Number(result.lastInsertRowid), userId) ?? null;
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
  return true;
}

export function listRoomMessages(roomId: number, limit = 200): RoomMessage[] {
  const rows = db.prepare('SELECT * FROM room_messages WHERE room_id = ? ORDER BY id DESC LIMIT ?').all(roomId, limit) as RoomMessageRow[];
  return rows
    .map((row): RoomMessage => ({
      id: row.id,
      roomId: row.room_id,
      role: row.role === 'user' ? 'user' : 'assistant',
      speakerId: row.speaker_id,
      content: row.content,
      createdAt: row.created_at,
    }))
    .reverse();
}

export function addRoomMessage(roomId: number, role: 'user' | 'assistant', speakerId: string | null, content: string): RoomMessage {
  const now = Date.now();
  const result = db.prepare('INSERT INTO room_messages (room_id, role, speaker_id, content, created_at) VALUES (?,?,?,?,?)').run(roomId, role, speakerId, content, now);
  db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(now, roomId);
  return { id: Number(result.lastInsertRowid), roomId, role, speakerId, content, createdAt: now };
}

export function deleteRoomMessage(messageId: number): void {
  db.prepare('DELETE FROM room_messages WHERE id = ?').run(messageId);
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
  loreEntries: LoreEntry[];
  regexRules: RegexRule[];
};

export function buildRoomPrompt(input: RoomPromptInput): ChatMessage[] {
  const { room, messages, speaker, preset, persona, loreEntries, regexRules } = input;
  const userName = persona?.name || '你';
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
    blocks.push(`### 角色 · ${character.name}\n${card}`);
  }

  const scanTexts = recent.map((message) => `${message.role === 'user' ? userName : nameOf(message.speakerId)}：${message.content}`);
  scanTexts.push(...members.map((character) => character.description));
  const scan = scanLore(loreEntries, scanTexts);
  if (scan.entries.length) blocks.push(`### 世界书命中\n${scan.entries.map((entry) => `【${entry.title}】${entry.text}`).join('\n')}`);
  if (persona?.description.trim()) blocks.push(`### 玩家身份\n【身份】${persona.name}\n${persona.description.trim()}`);

  blocks.push(
    [
      '### 本场规则',
      `这是多角色场景，玩家是「${userName}」。本轮发言人：${speaker.name}（其他角色这一轮不发言）。`,
      `只写 ${speaker.name} 的动作与台词；不要写其他角色的台词或动作，不要替玩家行动。`,
      `不要用「${speaker.name}：」这样的名字开头，直接写内容。`,
      '回复保持简短（一到三段），给其他人留出接话的空间。',
    ].join('\n'),
  );

  const history: ChatMessage[] = recent.map((message) => ({
    role: message.role === 'user' ? 'user' : 'assistant',
    content: `${message.role === 'user' ? userName : nameOf(message.speakerId)}：${applyRegex(regexRules, message.content, { target: message.role === 'user' ? 'user' : 'assistant', purpose: 'send' })}`,
  }));

  return [{ role: 'system', content: blocks.join('\n\n') }, ...history];
}
