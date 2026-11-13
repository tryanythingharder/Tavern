import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import db from '@/lib/db';

// 固定窗口限流：登录、注册、找回密码等敏感入口使用。
// 键做 sha256，避免把邮箱/IP 明文写进数据库。
export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number };

function digest(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function rateLimit(prefix: string, parts: string[], limit: number, windowMs: number): RateLimitResult {
  const key = `${prefix}:${digest(parts)}`;
  const now = Date.now();
  const row = db.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?').get(key) as { window_start: number; count: number } | undefined;
  if (!row || now - row.window_start >= windowMs) {
    db.prepare(`
            INSERT INTO rate_limits (key, window_start, count) VALUES (?,?,1)
            ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = 1
        `).run(key, now);
    return { ok: true };
  }
  if (row.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((row.window_start + windowMs - now) / 1000)) };
  }
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
  return { ok: true };
}

// 反代后优先取 X-Forwarded-For 的第一个地址；直连时用 X-Real-IP。
export async function clientIp(): Promise<string> {
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
}

export function ipFromRequest(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
