import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// RFC 6238 TOTP（SHA1 / 6 位 / 30 秒）+ 一次性恢复码。
// 不引入第三方依赖，便于单机部署；密钥只在服务端读取，管理接口只返回状态。
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = ((digest[offset] & 0x7f) << 24 | digest[offset + 1] << 16 | digest[offset + 2] << 8 | digest[offset + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const input = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(input) || !secret) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = totpCode(secret, now + offset * 30_000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(input))) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, email: string, issuer = '夜话'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 8): string[] {
  const pick = () => Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
  return Array.from({ length: count }, () => `${pick()}-${pick()}`);
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(String(code).replace(/[-\s]/g, '').toUpperCase()).digest('hex');
}

export function parseRecoveryHashes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// 恢复码一次性使用：命中后返回剩余哈希，调用方负责写回。
export function consumeRecoveryCode(raw: string | null, code: string): { ok: boolean; remaining: string[] } {
  const hashes = parseRecoveryHashes(raw);
  const target = hashRecoveryCode(code);
  const index = hashes.indexOf(target);
  if (index < 0) return { ok: false, remaining: hashes };
  return { ok: true, remaining: hashes.filter((_, i) => i !== index) };
}
