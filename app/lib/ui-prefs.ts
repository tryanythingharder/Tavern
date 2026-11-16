import db from './db';

// 跟账号走的界面偏好：语言、主题、玩法模式、外观。浏览器里仍以 cookie 为准（首屏无需查库），
// 每次改动同步到账号；在新设备登录时把账号里的偏好写回 cookie。
export const SYNCED_COOKIES = ['tavern_lang', 'tavern_theme', 'tavern_mode', 'tavern_appearance'] as const;
export type SyncedCookie = (typeof SYNCED_COOKIES)[number];
export type UiPrefs = Partial<Record<SyncedCookie, string>>;

const KEY_OF: Record<string, SyncedCookie> = { lang: 'tavern_lang', theme: 'tavern_theme', mode: 'tavern_mode', appearance: 'tavern_appearance' };

function valid(name: SyncedCookie, value: string): boolean {
  if (name === 'tavern_lang') return value === 'zh' || value === 'en';
  if (name === 'tavern_theme') return value === 'folio' || value === 'stage';
  if (name === 'tavern_mode') return value === 'newbie' || value === 'simple' || value === 'full';
  // 外观是 lib/appearance 序列化后的短串，只做长度与字符集检查，读取时还会再 sanitize
  return value.length <= 1500 && /^[A-Za-z0-9%._~!*'()-]*$/.test(value);
}

export function getUiPrefs(userId: number): UiPrefs {
  const row = db.prepare('SELECT ui_prefs FROM users WHERE id = ?').get(userId) as { ui_prefs: string | null } | undefined;
  if (!row?.ui_prefs) return {};
  try {
    const parsed = JSON.parse(row.ui_prefs) as Record<string, unknown>;
    const out: UiPrefs = {};
    for (const name of SYNCED_COOKIES) {
      const value = parsed[name];
      if (typeof value === 'string' && valid(name, value)) out[name] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** patch 的键可以是短名（lang/theme/mode/appearance）或 cookie 名；空串表示清除 */
export function mergeUiPrefs(userId: number, patch: Record<string, unknown>): UiPrefs {
  const next = { ...getUiPrefs(userId) };
  for (const [key, raw] of Object.entries(patch)) {
    const name = (KEY_OF[key] ?? key) as SyncedCookie;
    if (!SYNCED_COOKIES.includes(name) || typeof raw !== 'string') continue;
    if (raw === '') delete next[name];
    else if (valid(name, raw)) next[name] = raw;
  }
  db.prepare('UPDATE users SET ui_prefs = ? WHERE id = ?').run(JSON.stringify(next), userId);
  return next;
}
