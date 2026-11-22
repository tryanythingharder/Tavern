import { cookies, headers } from 'next/headers';
import db from '@/lib/db';
import { getSetting, setSetting } from '@/lib/settings';

// 18+ 内容的访问控制（backlog 9）。
// 两个概念分开：
//   access —— 这个人「能不能」看成人向角色（全站开关、地区、年龄、强验证），不满足时列表里不出现、角色页只剩名字、不能开聊
//   hidden —— 能看但自己选择隐藏（hide_nsfw），只影响列表，角色页给提示，仍能开聊（作者本人也一样）

export type NsfwPolicy = {
  enabled: boolean; // 全站总开关；关掉 = 只做全年龄（例如支付渠道不接成人内容时）
  defaultHidden: boolean; // 新账号默认隐藏 18+（广场默认过滤）
  blockedRegions: string[]; // 这些地区完全不提供 18+（国家代码 US，或细到州/省 US-UT）
  verifyRegions: string[]; // 这些地区要通过年龄验证服务才开放 18+（例如 GB、部分美国州）
  minAge: number; // 成人内容年龄线，默认 18
};

export const DEFAULT_POLICY: NsfwPolicy = { enabled: true, defaultHidden: true, blockedRegions: [], verifyRegions: [], minAge: 18 };

function regionList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,，;；]+/) : [];
  const out: string[] = [];
  for (const item of raw) {
    const code = String(item).trim().toUpperCase();
    if (/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, 300);
}

export function normalizePolicy(value: unknown): NsfwPolicy {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const age = Number(input.minAge);
  return {
    enabled: input.enabled === undefined ? DEFAULT_POLICY.enabled : input.enabled === true,
    defaultHidden: input.defaultHidden === undefined ? DEFAULT_POLICY.defaultHidden : input.defaultHidden === true,
    blockedRegions: regionList(input.blockedRegions),
    verifyRegions: regionList(input.verifyRegions),
    minAge: Number.isFinite(age) && age >= 18 && age <= 21 ? Math.round(age) : DEFAULT_POLICY.minAge,
  };
}

export function getPolicy(): NsfwPolicy {
  try {
    return normalizePolicy(JSON.parse(getSetting('nsfw.policy', '{}')));
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function setPolicy(patch: Partial<NsfwPolicy>): NsfwPolicy {
  const next = normalizePolicy({ ...getPolicy(), ...patch });
  setSetting('nsfw.policy', JSON.stringify(next));
  return next;
}

// 访问者所在地区：取 CDN/托管平台注入的头。都没有 = 未知（不拦，地区规则只对识别出来的地区生效）。
// 开发环境可以用 cookie tavern_geo=GB / US-UT 模拟。
export async function requestRegion(): Promise<{ country: string; region: string } | null> {
  const list = await headers();
  let country = (list.get('cf-ipcountry') || list.get('x-vercel-ip-country') || list.get('cloudfront-viewer-country') || list.get('x-country-code') || '').trim().toUpperCase();
  let sub = (list.get('x-vercel-ip-country-region') || list.get('cf-region-code') || list.get('cloudfront-viewer-country-region') || list.get('x-region-code') || '').trim().toUpperCase();
  if (process.env.NODE_ENV !== 'production') {
    const forced = (await cookies()).get('tavern_geo')?.value?.trim().toUpperCase();
    if (forced && /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(forced)) [country, sub = ''] = forced.split('-');
  }
  if (!/^[A-Z]{2}$/.test(country) || country === 'XX' || country === 'T1') return null;
  return { country, region: sub && /^[A-Z0-9]{1,3}$/.test(sub) ? `${country}-${sub}` : '' };
}

export function regionMatches(list: string[], where: { country: string; region: string } | null): boolean {
  if (!where) return false;
  return list.some((code) => code === where.country || (where.region !== '' && code === where.region));
}

// ---- 年龄 ----

export type AgeRecord = { birthDate: string | null; confirmedAt: number | null; verifiedAt: number | null; verifyMethod: string | null };

export function getAgeRecord(userId: number): AgeRecord {
  const row = db.prepare('SELECT birth_date, age_confirmed_at, age_verified_at, age_verify_method FROM users WHERE id = ?').get(userId) as
    | { birth_date: string | null; age_confirmed_at: number | null; age_verified_at: number | null; age_verify_method: string | null }
    | undefined;
  return { birthDate: row?.birth_date ?? null, confirmedAt: row?.age_confirmed_at ?? null, verifiedAt: row?.age_verified_at ?? null, verifyMethod: row?.age_verify_method ?? null };
}

// 'YYYY-MM-DD' → 周岁；格式不对或在未来返回 null
export function ageFrom(birthDate: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || date.getTime() > now.getTime()) return null;
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

// 出生日期只能自己填一次（填错找管理员改），避免未成年改一下就绕过去
export function setBirthDate(userId: number, birthDate: string): { ok: true; age: number } | { ok: false; error: string } {
  const age = ageFrom(birthDate);
  if (age === null || age > 120) return { ok: false, error: '出生日期不对' };
  const current = getAgeRecord(userId);
  if (current.birthDate && current.birthDate !== birthDate) return { ok: false, error: '出生日期已经填过了，需要修改请联系管理员' };
  db.prepare('UPDATE users SET birth_date = ?, age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?').run(birthDate, Date.now(), userId);
  return { ok: true, age };
}

export function adminSetAge(userId: number, patch: { birthDate?: string | null; verified?: boolean; method?: string }): void {
  if (patch.birthDate !== undefined) db.prepare('UPDATE users SET birth_date = ? WHERE id = ?').run(patch.birthDate && ageFrom(patch.birthDate) !== null ? patch.birthDate : null, userId);
  if (patch.verified === true) db.prepare('UPDATE users SET age_verified_at = ?, age_verify_method = ? WHERE id = ?').run(Date.now(), (patch.method || 'admin').slice(0, 40), userId);
  if (patch.verified === false) db.prepare('UPDATE users SET age_verified_at = NULL, age_verify_method = NULL WHERE id = ?').run(userId);
}

// 年龄验证服务回调用：标记已通过
export function markAgeVerified(userId: number, method: string): void {
  db.prepare('UPDATE users SET age_verified_at = ?, age_verify_method = ? WHERE id = ?').run(Date.now(), method.slice(0, 40), userId);
}

// ---- 汇总 ----

export type NsfwState =
  | 'allowed' // 可以看
  | 'site_off' // 全站关了 18+
  | 'region_blocked' // 所在地区不提供
  | 'guest' // 没登录
  | 'needs_age' // 还没填出生日期
  | 'underage' // 未满年龄线
  | 'needs_verification'; // 所在地区要求年龄验证，还没通过

export type NsfwAccess = { state: NsfwState; allowed: boolean; hidden: boolean; show: boolean; region: string | null; minAge: number };

export function hidePref(userId: number | null): boolean {
  if (!userId) return true;
  const row = db.prepare('SELECT hide_nsfw FROM users WHERE id = ?').get(userId) as { hide_nsfw: number } | undefined;
  return row ? row.hide_nsfw === 1 : true;
}

export function evaluate(
  policy: NsfwPolicy,
  userId: number | null,
  where: { country: string; region: string } | null,
  record: AgeRecord | null,
  hidden: boolean,
): NsfwAccess {
  const region = where ? where.region || where.country : null;
  const result = (state: NsfwState): NsfwAccess => ({ state, allowed: state === 'allowed', hidden, show: state === 'allowed' && !hidden, region, minAge: policy.minAge });
  if (!policy.enabled) return result('site_off');
  if (regionMatches(policy.blockedRegions, where)) return result('region_blocked');
  if (!userId || !record) return result('guest');
  if (!record.birthDate) return result('needs_age');
  const age = ageFrom(record.birthDate);
  if (age === null || age < policy.minAge) return result('underage');
  if (regionMatches(policy.verifyRegions, where) && !record.verifiedAt) return result('needs_verification');
  return result('allowed');
}

export async function nsfwAccess(userId: number | null): Promise<NsfwAccess> {
  return evaluate(getPolicy(), userId, await requestRegion(), userId ? getAgeRecord(userId) : null, hidePref(userId));
}

export const STATE_MESSAGE: Record<NsfwState, string> = {
  allowed: '',
  site_off: '本站目前不提供成人向内容',
  region_blocked: '你所在的地区暂不提供成人向内容',
  guest: '成人向角色需要登录并确认年龄',
  needs_age: '成人向角色需要先填写出生日期确认年龄',
  underage: '成人向角色仅向成年用户开放',
  needs_verification: '你所在的地区要求先完成年龄验证才能使用成人向角色',
};

// 生成/开聊前的硬拦截：作者本人始终可以用自己的卡；返回错误文案或 null
export async function nsfwBlock(userId: number | null, character: { nsfw: boolean | number; ownerId?: number | null; owner_id?: number | null } | null | undefined): Promise<string | null> {
  if (!character || !(character.nsfw === true || character.nsfw === 1)) return null;
  const owner = character.ownerId ?? character.owner_id ?? null;
  if (userId && owner === userId) return null;
  const access = await nsfwAccess(userId);
  return access.allowed ? null : STATE_MESSAGE[access.state];
}

// 新账号的默认隐藏偏好
export function applyDefaultHide(userId: number): void {
  db.prepare('UPDATE users SET hide_nsfw = ? WHERE id = ?').run(getPolicy().defaultHidden ? 1 : 0, userId);
}

// 群聊：任何一位成员是成人向且当前不能看，就整房间拦下
export async function roomNsfwBlock(userId: number | null, characterIds: unknown): Promise<string | null> {
  if (!Array.isArray(characterIds)) return null;
  const { getCharacterById } = await import('@/lib/db');
  for (const id of characterIds) {
    const row = getCharacterById(String(id));
    const message = await nsfwBlock(userId, row ?? null);
    if (message) return message;
  }
  return null;
}
