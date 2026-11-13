import { randomInt } from 'node:crypto';
import db from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';

// 邀请码：管理员生成，注册时可填；不强制要求，填了就校验并标记使用。
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  const pick = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `INV-${pick()}-${pick()}`;
}

export type InviteCode = { code: string; note: string; usedBy: number | null; usedByName: string | null; createdByName: string | null; createdAt: number; usedAt: number | null };

type Row = { code: string; note: string; used_by: number | null; created_at: number; used_at: number | null; used_name?: string | null; creator_name?: string | null };

export function createInvites(adminId: number, count: number, note: string): InviteCode[] {
  const total = Math.max(1, Math.min(100, Math.round(count)));
  const insert = db.prepare('INSERT INTO invite_codes (code, created_by, note, created_at) VALUES (?,?,?,?)');
  const creator = (db.prepare('SELECT nickname FROM users WHERE id = ?').get(adminId) as { nickname: string } | undefined)?.nickname ?? null;
  const created: InviteCode[] = [];
  for (let index = 0; index < total; index += 1) {
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!db.prepare('SELECT 1 AS ok FROM invite_codes WHERE code = ?').get(code)) break;
      code = randomCode();
    }
    insert.run(code, adminId, note.slice(0, 60), Date.now());
    created.push({ code, note: note.slice(0, 60), usedBy: null, usedByName: null, createdByName: creator, createdAt: Date.now(), usedAt: null });
  }
  return created;
}

export function listInvites(limit = 100): InviteCode[] {
  const rows = db.prepare(`
        SELECT i.*, u.nickname AS used_name, c.nickname AS creator_name
        FROM invite_codes i LEFT JOIN users u ON u.id = i.used_by LEFT JOIN users c ON c.id = i.created_by
        ORDER BY i.created_at DESC LIMIT ?
    `).all(limit) as Row[];
  return rows.map((row) => ({ code: row.code, note: row.note, usedBy: row.used_by, usedByName: row.used_name ?? null, createdByName: row.creator_name ?? null, createdAt: row.created_at, usedAt: row.used_at }));
}

export function inviteRequired(): boolean {
  return getSetting('invite.required', '') === '1';
}

export function setInviteRequired(value: boolean): void {
  setSetting('invite.required', value ? '1' : '0');
}

export function inviteValid(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return true; // 不填视为不要求
  const row = db.prepare('SELECT used_by FROM invite_codes WHERE code = ?').get(normalized) as { used_by: number | null } | undefined;
  return Boolean(row) && row!.used_by === null;
}

export function redeemInvite(code: string, userId: number): boolean {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return true;
  const changed = db.prepare('UPDATE invite_codes SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL').run(userId, Date.now(), normalized);
  return Number(changed.changes) > 0;
}
