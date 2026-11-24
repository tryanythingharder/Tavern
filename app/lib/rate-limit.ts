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

// 客户端地址：
// - 默认（TAVERN_TRUSTED_PROXY 未开启）完全不看 X-Forwarded-For / X-Real-IP，只用 TCP 对端地址。
//   对端地址由 instrumentation.ts 在请求进入 Next 之前写进 PEER_HEADER（会先丢弃客户端自带的同名头）。
// - 开启 TAVERN_TRUSTED_PROXY=1（应用只能经由自己的反代访问时）才读 X-Forwarded-For，并取最右一跳：
//   反代（如 nginx 的 $proxy_add_x_forwarded_for）会把它看到的对端追加在最右，左边的部分客户端可以随便伪造。
export const PEER_HEADER = 'x-tavern-peer';

export function trustedProxy(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.TAVERN_TRUSTED_PROXY ?? '');
}

type HeaderGetter = { get(name: string): string | null };

function normalizeIp(ip: string): string {
  const v = ip.trim();
  return v.startsWith('::ffff:') && v.includes('.') ? v.slice(7) : v;
}

let warnedNoPeer = false;
export function ipFromHeaders(list: HeaderGetter): string {
  const peer = list.get(PEER_HEADER)?.trim() || '';
  if (trustedProxy()) {
    const hops = (list.get('x-forwarded-for') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
    const last = hops.at(-1);
    if (last) return normalizeIp(last);
  }
  if (peer) return normalizeIp(peer);
  if (!warnedNoPeer) {
    warnedNoPeer = true;
    console.warn('[rate-limit] 拿不到 TCP 对端地址（instrumentation 未生效？），客户端地址记为 unknown');
  }
  return 'unknown';
}

export async function clientIp(): Promise<string> {
  return ipFromHeaders(await headers());
}

export function ipFromRequest(request: Request): string {
  return ipFromHeaders(request.headers);
}
