import { cookies } from 'next/headers';
import { APPEARANCE_COOKIE, parseAppearanceCookie, type AppearancePrefs } from '@/lib/appearance';

// 两套主题：书页（杂志排版）/ 戏台（角色卡牌）。配色令牌共用。
// 夜幕（暗场）已按需求下线；旧 cookie 'nocturne' 自动落到默认主题。
export type Theme = 'folio' | 'stage';
export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'folio', label: '书页', hint: '杂志式排版，像读一本小说' },
  { id: 'stage', label: '戏台', hint: '角色卡牌，轻快好玩' },
];
export const DEFAULT_THEME: Theme = 'folio';

export function parseTheme(value: string | undefined | null): Theme {
  return value === 'folio' || value === 'stage' ? value : DEFAULT_THEME;
}

// 明暗：每套主题都有浅色（白天）与深色（夜间）；默认跟随系统
export type Scheme = 'system' | 'light' | 'dark';
export const SCHEME_COOKIE = 'tavern_scheme';
export const DEFAULT_SCHEME: Scheme = 'system';
export function parseScheme(value: string | undefined | null): Scheme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_SCHEME;
}
export async function getScheme(): Promise<Scheme> {
  const store = await cookies();
  return parseScheme(store.get(SCHEME_COOKIE)?.value);
}

export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  return parseTheme(store.get('tavern_theme')?.value);
}

// 用户自定义外观（字体/字号/配色/圆角…），校验后返回；没设置时就是默认值
export async function getAppearancePrefs(): Promise<AppearancePrefs> {
  const store = await cookies();
  return parseAppearanceCookie(store.get(APPEARANCE_COOKIE)?.value);
}
