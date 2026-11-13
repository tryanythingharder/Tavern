import { randomBytes } from 'node:crypto';
import db from '@/lib/db';

// 一次性令牌：邮箱验证 / 找回密码 / 登录 2FA 挑战 / 换邮箱。令牌本身高熵且一次性，直接存 token。
export type TokenKind = 'verify' | 'reset' | '2fa' | 'email';

export function createAuthToken(userId: number, kind: TokenKind, ttlMs: number, meta?: string): string {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  // 同一用户同类旧令牌作废，避免多封邮件同时可用
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
  db.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires_at, created_at, meta) VALUES (?,?,?,?,?,?)').run(token, userId, kind, now + ttlMs, now, meta ?? null);
  return token;
}

export function authTokenMeta(token: string, kind: TokenKind): string | null {
  const row = db.prepare('SELECT meta FROM auth_tokens WHERE token = ? AND kind = ?').get(token, kind) as { meta: string | null } | undefined;
  return row?.meta ?? null;
}

export function consumeAuthToken(token: string, kind: TokenKind): number | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token = ? AND kind = ?').get(token, kind) as
    | { user_id: number; expires_at: number; used_at: number | null }
    | undefined;
  if (!row || row.used_at || row.expires_at < Date.now()) return null;
  db.prepare('UPDATE auth_tokens SET used_at = ? WHERE token = ?').run(Date.now(), token);
  return row.user_id;
}

export function peekAuthToken(token: string, kind: TokenKind): number | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare('SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token = ? AND kind = ?').get(token, kind) as
    | { user_id: number; expires_at: number; used_at: number | null }
    | undefined;
  if (!row || row.used_at || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export function purgeAuthTokens(): void {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at < ? OR used_at IS NOT NULL').run(Date.now() - 24 * 60 * 60 * 1000);
}
