import { SYNCED_COOKIES, getUiPrefs, mergeUiPrefs } from './ui-prefs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import db, { transaction } from '@/lib/db';
import { deleteMediaByOwner } from '@/lib/storage';
import { consumeRecoveryCode, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUrl, parseRecoveryHashes, verifyTotp } from '@/lib/totp';

// 认证：scrypt 哈希 + 数据库会话 token。只用 Node 内置 crypto，零依赖。
// 登录/注册/找回限流在 rate-limit.ts；管理员 2FA 在 totp.ts。
const SESSION_COOKIE = 'tavern_session';
const SESSION_DAYS = 30;

export type User = { id: number; email: string; nickname: string; role: 'user' | 'admin' };

// 管理员身份：数据库 role 优先；环境变量邮箱只作为已验证邮箱的兜底，
// 避免冷启动时有人抢注管理员邮箱直接拿到后台权限。
export function isAdminIdentity(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const list = (process.env.TAVERN_ADMIN_EMAILS ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!list.includes(user.email.toLowerCase())) return false;
  const row = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(user.id) as { email_verified_at: number | null } | undefined;
  return Boolean(row?.email_verified_at);
}

// 生产可强制管理员开启 2FA；未开启时后台 API/页面都不可用。
export function isAdmin(user: User | null | undefined): boolean {
  if (!isAdminIdentity(user)) return false;
  return adminTwoFactorReady(user!);
}

export function adminTwoFactorReady(user: User): boolean {
  return process.env.TAVERN_REQUIRE_ADMIN_2FA !== '1' || isTwoFactorEnabled(user.id);
}

export function isTwoFactorEnabled(userId: number): boolean {
  const row = db.prepare('SELECT totp_secret, totp_enabled_at FROM users WHERE id = ?').get(userId) as { totp_secret: string | null; totp_enabled_at: number | null } | undefined;
  return Boolean(row?.totp_secret && row.totp_enabled_at);
}

export function twoFactorStatus(userId: number): { enabled: boolean; recoveryRemaining: number } {
  const row = db.prepare('SELECT totp_recovery, totp_enabled_at FROM users WHERE id = ?').get(userId) as { totp_recovery: string | null; totp_enabled_at: number | null } | undefined;
  return { enabled: Boolean(row?.totp_enabled_at), recoveryRemaining: parseRecoveryHashes(row?.totp_recovery ?? null).length };
}

// 生成待确认的密钥与恢复码；此时还不算启用，必须再输入一次验证码。
export function beginTwoFactorSetup(userId: number): { secret: string; otpauth: string; recoveryCodes: string[] } {
  const row = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!row) throw new Error('用户不存在');
  const secret = generateTotpSecret();
  const recoveryCodes = generateRecoveryCodes();
  db.prepare('UPDATE users SET totp_secret = ?, totp_recovery = ?, totp_enabled_at = NULL WHERE id = ?').run(
    secret,
    JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
    userId,
  );
  return { secret, otpauth: otpauthUrl(secret, row.email), recoveryCodes };
}

export function enableTwoFactor(userId: number, code: string): boolean {
  const row = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as { totp_secret: string | null } | undefined;
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, code)) return false;
  db.prepare('UPDATE users SET totp_enabled_at = ? WHERE id = ?').run(Date.now(), userId);
  return true;
}

export function verifyTwoFactor(userId: number, code: string): boolean {
  const row = db.prepare('SELECT totp_secret, totp_recovery, totp_enabled_at FROM users WHERE id = ?').get(userId) as
    | { totp_secret: string | null; totp_recovery: string | null; totp_enabled_at: number | null }
    | undefined;
  if (!row?.totp_enabled_at || !row.totp_secret) return false;
  if (verifyTotp(row.totp_secret, code)) return true;
  const recovery = consumeRecoveryCode(row.totp_recovery, code);
  if (!recovery.ok) return false;
  db.prepare('UPDATE users SET totp_recovery = ? WHERE id = ?').run(JSON.stringify(recovery.remaining), userId);
  return true;
}

export function disableTwoFactor(userId: number): void {
  db.prepare('UPDATE users SET totp_secret = NULL, totp_recovery = NULL, totp_enabled_at = NULL WHERE id = ?').run(userId);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function createUser(email: string, password: string, nickname: string): User {
  const now = Date.now();
  const result = db.prepare('INSERT INTO users (email, password_hash, nickname, created_at) VALUES (?,?,?,?)').run(email, hashPassword(password), nickname, now);
  return { id: Number(result.lastInsertRowid), email, nickname, role: 'user' };
}

// 换邮箱：新邮箱通过确认链接后写入，并标记为已验证。
export function updateEmail(userId: number, email: string): void {
  db.prepare('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?').run(email, Date.now(), userId);
}

// 注册时记录年龄与条款确认时间（只记录确认动作，不存出生日期）
export function confirmAge(userId: number): void {
  db.prepare('UPDATE users SET age_confirmed_at = ? WHERE id = ?').run(Date.now(), userId);
}

export function updateNickname(userId: number, nickname: string): void {
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId);
}

export function getAuthorBio(userId: number): string {
  const row = db.prepare('SELECT author_bio FROM users WHERE id = ?').get(userId) as { author_bio: string | null } | undefined;
  return row?.author_bio?.trim() ?? '';
}

export function updateAuthorBio(userId: number, bio: string): void {
  const value = bio.trim().slice(0, 200);
  db.prepare('UPDATE users SET author_bio = ? WHERE id = ?').run(value || null, userId);
}

export type ProfileMedia = { avatar: string | null; banner: string | null };

export function getProfileMedia(userId: number): ProfileMedia {
  const row = db.prepare('SELECT avatar_url, banner_url FROM users WHERE id = ?').get(userId) as { avatar_url: string | null; banner_url: string | null } | undefined;
  return { avatar: row?.avatar_url || null, banner: row?.banner_url || null };
}

/** 按作者昵称查头像与背景（作者页、评论用；昵称不唯一时取最早注册的账号，与 authorBio 一致） */
export function profileMediaByName(nickname: string): ProfileMedia {
  const row = db.prepare('SELECT avatar_url, banner_url FROM users WHERE nickname = ? ORDER BY id LIMIT 1').get(nickname) as { avatar_url: string | null; banner_url: string | null } | undefined;
  return { avatar: row?.avatar_url || null, banner: row?.banner_url || null };
}

export function setProfileMedia(userId: number, kind: 'avatar' | 'banner', url: string | null): void {
  db.prepare(`UPDATE users SET ${kind === 'avatar' ? 'avatar_url' : 'banner_url'} = ? WHERE id = ?`).run(url, userId);
}

export function getPasswordHash(userId: number): string | null {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  return row?.password_hash ?? null;
}

export function updatePassword(userId: number, password: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
}

export function findUserByEmail(email: string): (User & { password_hash: string; status: string }) | undefined {
  return db.prepare('SELECT id, email, nickname, role, status, password_hash FROM users WHERE email = ?').get(email) as (User & { password_hash: string; status: string }) | undefined;
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const headerList = await headers();
  const userAgent = headerList.get('user-agent')?.slice(0, 240) ?? null;
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || headerList.get('x-real-ip') || null;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at, user_agent, ip) VALUES (?,?,?,?,?,?)').run(token, userId, expires, now, userAgent, ip);
  const store = await cookies();
  // 本地 HTTP 开发不能带 Secure；生产只要站点地址是 https（或显式开启）就强制 Secure
  const secure = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://') || process.env.TAVERN_COOKIE_SECURE === '1';
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 24 * 60 * 60, secure });
  // 界面偏好跟账号走：账号里存过就写回这台设备；还没存过就把这台设备当前的设置存进账号
  const saved = getUiPrefs(userId);
  if (Object.keys(saved).length) {
    // cookies().set 会再做一次 URL 编码，外观串本身已编码，先解开一层
    for (const [name, value] of Object.entries(saved)) store.set(name, name === 'tavern_appearance' ? decodeURIComponent(value) : value, { path: '/', maxAge: 365 * 24 * 60 * 60, sameSite: 'lax' });
  } else {
    const current: Record<string, string> = {};
    for (const name of SYNCED_COOKIES) { const value = store.get(name)?.value; if (value) current[name] = name === 'tavern_appearance' ? encodeURIComponent(value) : value; }
    if (Object.keys(current).length) mergeUiPrefs(userId, current);
  }
}

export async function currentSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export type SessionInfo = { token: string; createdAt: number | null; expiresAt: number; userAgent: string | null; ip: string | null; current: boolean };

export async function listSessions(userId: number): Promise<SessionInfo[]> {
  const current = await currentSessionToken();
  const rows = db.prepare('SELECT token, created_at, expires_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC, expires_at DESC LIMIT 20').all(userId, Date.now()) as {
    token: string; created_at: number | null; expires_at: number; user_agent: string | null; ip: string | null;
  }[];
  return rows.map((row) => ({
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    userAgent: row.user_agent,
    ip: row.ip,
    current: row.token === current,
  }));
}

export function revokeSession(userId: number, token: string): boolean {
  return db.prepare('DELETE FROM sessions WHERE token = ? AND user_id = ?').run(token, userId).changes > 0;
}

export function revokeOtherSessions(userId: number, keepToken: string | null): number {
  const result = keepToken
    ? db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken)
    : db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  return Number(result.changes);
}

export function revokeAllSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function isEmailVerified(userId: number): boolean {
  const row = db.prepare('SELECT email_verified_at FROM users WHERE id = ?').get(userId) as { email_verified_at: number | null } | undefined;
  return Boolean(row?.email_verified_at);
}

export function markEmailVerified(userId: number): void {
  db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(Date.now(), userId);
}

// 生产可开启「验证邮箱后才能生成/发布」；本地默认关闭，避免打断演示与验收。
export function emailVerificationRequired(): boolean {
  return process.env.TAVERN_REQUIRE_EMAIL_VERIFY === '1';
}

export function canGenerate(user: User): boolean {
  return !emailVerificationRequired() || isEmailVerified(user.id);
}

// 账号注销：删除个人内容与会话；保留订单/点数流水等财务记录（匿名化用户行），
// 名下的角色改为归档且不再归属任何人，避免删掉其他玩家已经付费的会话。
export function deleteAccountData(userId: number): void {
  transaction(() => {
    const ownedCharacters = db.prepare('SELECT id FROM characters WHERE owner_id = ?').all(userId) as { id: string }[];
    for (const character of ownedCharacters) {
      db.prepare(`
                UPDATE characters
                SET owner_id = NULL, author = '已注销作者', status = 'archived',
                    cover_image = NULL, avatar_image = NULL, review_note = NULL
                WHERE id = ?
            `).run(character.id);
      db.prepare('DELETE FROM character_versions WHERE character_id = ?').run(character.id);
      db.prepare('DELETE FROM character_favorites WHERE character_id = ?').run(character.id);
      db.prepare('DELETE FROM character_added WHERE character_id = ?').run(character.id);
      db.prepare('DELETE FROM character_overrides WHERE character_id = ?').run(character.id);
      db.prepare('DELETE FROM comments WHERE character_id = ?').run(character.id);
      // 注意：不删除 chats/messages —— 其他玩家与这个角色的会话仍然可读
    }
    db.prepare('DELETE FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM chat_backups WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM chats WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM room_messages WHERE room_id IN (SELECT id FROM rooms WHERE user_id = ?)').run(userId);
    db.prepare('DELETE FROM rooms WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM presets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM lorebooks WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM regex_rules WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM personas WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM quick_replies WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM character_favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM character_added WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM character_overrides WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM reports WHERE reporter_id = ?').run(userId);
    db.prepare('DELETE FROM comments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM checkins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    // 财务记录保留：orders / points_ledger / generation_events 不删；用户行匿名化
    db.prepare(`
            UPDATE users
            SET email = ?, nickname = '已注销用户', password_hash = '', status = 'deleted',
                role = 'user', author_bio = NULL, avatar_url = NULL, banner_url = NULL, email_verified_at = NULL, hide_nsfw = 1
            WHERE id = ?
        `).run(`deleted-${userId}@invalid.local`, userId);
  });
  // 文件删除不可回滚，放在事务之后；失败不影响账号注销
  try {
    deleteMediaByOwner(userId);
  } catch (error) {
    console.warn('[media] 注销账号时清理媒体失败', error);
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db.prepare(`SELECT u.id, u.email, u.nickname, u.role, u.status, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(token) as (User & { expires_at: number; status: string }) | undefined;
  if (!row) return null;
  if (row.expires_at < Date.now() || row.status === 'banned' || row.status === 'deleted') {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return { id: row.id, email: row.email, nickname: row.nickname, role: row.role === 'admin' ? 'admin' : 'user' };
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  store.delete(SESSION_COOKIE);
}
