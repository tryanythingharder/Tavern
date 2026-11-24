import db from '@/lib/db';
import type { LoreRole } from '@/lib/resources';
import { loadExtras } from '@/lib/card-extras';

// 角色卡覆盖：对应 ST 角色卡的 system_prompt / post_history_instructions / mes_example / depth_prompt。
// 种子角色是共享的，覆盖按 (user_id, character_id) 存，不污染角色本身。
export type CharacterOverride = {
  characterId: string;
  systemPrompt: string;
  postHistory: string;
  mesExample: string;
  depthPrompt: string;
  depthDepth: number;
  depthRole: LoreRole;
};

type Row = {
  character_id: string;
  system_prompt: string;
  post_history: string;
  mes_example: string;
  depth_prompt: string;
  depth_depth: number;
  depth_role: string;
};

function fromRow(row: Row): CharacterOverride {
  return {
    characterId: row.character_id,
    systemPrompt: row.system_prompt,
    postHistory: row.post_history,
    mesExample: row.mes_example,
    depthPrompt: row.depth_prompt,
    depthDepth: row.depth_depth,
    depthRole: row.depth_role === 'user' || row.depth_role === 'assistant' ? row.depth_role : 'system',
  };
}

export function getOverride(userId: number, characterId: string): CharacterOverride | null {
  const row = db.prepare('SELECT * FROM character_overrides WHERE user_id = ? AND character_id = ?').get(userId, characterId) as Row | undefined;
  if (row) return fromRow(row);
  // 玩家没改过：用卡自带的深度提示（extensions.depth_prompt）
  const depth = loadExtras(characterId).depth;
  return depth ? { characterId, systemPrompt: '', postHistory: '', mesExample: '', depthPrompt: depth.prompt, depthDepth: depth.depth, depthRole: depth.role } : null;
}

export function listOverrides(userId: number): Record<string, CharacterOverride> {
  const rows = db.prepare('SELECT * FROM character_overrides WHERE user_id = ?').all(userId) as Row[];
  return Object.fromEntries(rows.map((row) => [row.character_id, fromRow(row)]));
}

export type OverrideInput = Partial<Omit<CharacterOverride, 'characterId'>>;

export function saveOverride(userId: number, characterId: string, input: OverrideInput): CharacterOverride {
  const current = getOverride(userId, characterId);
  const next = {
    systemPrompt: input.systemPrompt ?? current?.systemPrompt ?? '',
    postHistory: input.postHistory ?? current?.postHistory ?? '',
    mesExample: input.mesExample ?? current?.mesExample ?? '',
    depthPrompt: input.depthPrompt ?? current?.depthPrompt ?? '',
    depthDepth: Number.isFinite(Number(input.depthDepth)) ? Math.max(0, Math.min(999, Math.round(Number(input.depthDepth)))) : current?.depthDepth ?? 4,
    depthRole: input.depthRole === 'user' || input.depthRole === 'assistant' ? input.depthRole : input.depthRole === 'system' ? 'system' : current?.depthRole ?? 'system',
  };
  db.prepare(`
        INSERT INTO character_overrides (user_id, character_id, system_prompt, post_history, mes_example, depth_prompt, depth_depth, depth_role, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(user_id, character_id) DO UPDATE SET
            system_prompt = excluded.system_prompt,
            post_history = excluded.post_history,
            mes_example = excluded.mes_example,
            depth_prompt = excluded.depth_prompt,
            depth_depth = excluded.depth_depth,
            depth_role = excluded.depth_role,
            updated_at = excluded.updated_at
    `).run(userId, characterId, next.systemPrompt, next.postHistory, next.mesExample, next.depthPrompt, next.depthDepth, next.depthRole, Date.now());
  return { characterId, ...next };
}

export function deleteOverride(userId: number, characterId: string): boolean {
  return Number(db.prepare('DELETE FROM character_overrides WHERE user_id = ? AND character_id = ?').run(userId, characterId).changes) > 0;
}
