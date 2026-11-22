import crypto from 'node:crypto';
import db from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';
import { reportError } from '@/lib/monitor';
import { serviceValue } from '@/lib/service-config';

// PWA 推送：标准 Web Push（RFC 8030），载荷加密 RFC 8291（aes128gcm），身份 VAPID RFC 8292。
// 不依赖第三方包。VAPID 密钥优先读环境变量 TAVERN_VAPID_PUBLIC / TAVERN_VAPID_PRIVATE（base64url），
// 没配置时首次使用自动生成并存进 app_settings（push.vapid），重启不会变，避免已订阅的设备失效。

db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
`);

const b64u = (buf: Buffer) => buf.toString('base64url');
const fromB64u = (text: string) => Buffer.from(text, 'base64url');

type Vapid = { publicKey: string; privateKey: string; subject: string };
let cached: Vapid | null = null;

function vapidSubject(): string {
  const own = serviceValue('push.subject');
  if (own) return /^(mailto:|https:)/.test(own) ? own : `mailto:${own}`;
  return `mailto:${serviceValue('site.supportEmail') || 'admin@tavern.local'}`;
}

export function vapidStatus() {
  const v = vapidKeys();
  const source = process.env.TAVERN_VAPID_PUBLIC && process.env.TAVERN_VAPID_PRIVATE ? 'env' : 'auto';
  return { publicKey: v.publicKey, subject: vapidSubject(), source, subscriptions: (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n };
}

// 重新生成会让所有已订阅设备失效（需要用户重新打开通知）；环境变量指定的密钥不能在后台改
export function regenerateVapid(): boolean {
  if (process.env.TAVERN_VAPID_PUBLIC && process.env.TAVERN_VAPID_PRIVATE) return false;
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  setSetting('push.vapid', JSON.stringify({ publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) }));
  db.prepare('DELETE FROM push_subscriptions').run();
  cached = null;
  return true;
}

export function resetVapidCache(): void {
  cached = null;
}

export function vapidKeys(): Vapid {
  if (cached) return cached;
  const subject = vapidSubject();
  if (process.env.TAVERN_VAPID_PUBLIC && process.env.TAVERN_VAPID_PRIVATE) {
    cached = { publicKey: process.env.TAVERN_VAPID_PUBLIC, privateKey: process.env.TAVERN_VAPID_PRIVATE, subject };
    return cached;
  }
  const stored = getSetting('push.vapid');
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { publicKey: string; privateKey: string };
      cached = { ...parsed, subject };
      return cached;
    } catch { /* 损坏就重新生成 */ }
  }
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
  setSetting('push.vapid', JSON.stringify(keys));
  cached = { ...keys, subject };
  return cached;
}

function vapidPrivateKeyObject(v: Vapid): crypto.KeyObject {
  const pub = fromB64u(v.publicKey);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

function vapidHeader(endpoint: string): string {
  const v = vapidKeys();
  const aud = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: vapidPrivateKeyObject(v), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${v.publicKey}`;
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

// RFC 8291：用订阅方的 p256dh/auth 加密载荷，单记录 aes128gcm。
export function encryptPayload(payload: Buffer, p256dh: string, authSecret: string): Buffer {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(auth, shared, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

export function saveSubscription(userId: number, sub: PushSubscriptionInput): void {
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now());
}

export function removeSubscription(userId: number, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

export function subscriptionCount(userId: number): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(userId) as { n: number }).n;
}

export function isValidSubscription(value: unknown): value is PushSubscriptionInput {
  const sub = value as PushSubscriptionInput;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return false;
  try {
    const url = new URL(sub.endpoint);
    if (url.protocol !== 'https:') return false;
  } catch { return false; }
  return typeof sub.keys.p256dh === 'string' && fromB64u(sub.keys.p256dh).length === 65
    && typeof sub.keys.auth === 'string' && fromB64u(sub.keys.auth).length >= 16;
}

type Row = { id: number; endpoint: string; p256dh: string; auth: string };

// 给某个用户的所有设备推一条。失败不影响站内通知；404/410 说明订阅已失效，直接删掉。
export async function pushToUser(userId: number, message: { title: string; body?: string; link?: string | null; tag?: string }): Promise<void> {
  const rows = db.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as Row[];
  if (!rows.length) return;
  const payload = Buffer.from(JSON.stringify({ title: message.title, body: message.body ?? '', link: message.link ?? '/notifications', tag: message.tag }));
  await Promise.all(rows.map(async (row) => {
    try {
      const response = await fetch(row.endpoint, {
        method: 'POST',
        headers: {
          TTL: '86400',
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          Urgency: 'normal',
          Authorization: vapidHeader(row.endpoint),
        },
        body: new Uint8Array(encryptPayload(payload, row.p256dh, row.auth)),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 404 || response.status === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
      } else if (!response.ok) {
        reportError({ source: 'server', message: `web-push ${response.status}`, extra: { host: new URL(row.endpoint).host } });
      }
    } catch (error) {
      reportError({ source: 'server', message: `web-push failed: ${error instanceof Error ? error.message : String(error)}`, extra: { host: new URL(row.endpoint).host } });
    }
  }));
}
