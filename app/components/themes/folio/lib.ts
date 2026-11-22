import { currentLocale } from '@/lib/i18n/runtime';
// 书页主题的小工具：期号、罗马数字、拼音式拉丁名等纯函数（服务端/客户端通用）

const CN_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function cnYear(year: number): string {
  if (currentLocale() === 'en') return String(year);
  return String(year).split('').map((d) => CN_DIGITS[Number(d)]).join('');
}

export function season(month: number): string {
  if (month === 12 || month <= 2) return '冬季号';
  if (month <= 5) return '春季号';
  if (month <= 8) return '夏季号';
  return '秋季号';
}

export function seasonEn(month: number): string {
  if (month === 12 || month <= 2) return 'Winter';
  if (month <= 5) return 'Spring';
  if (month <= 8) return 'Summer';
  return 'Autumn';
}

const ROMAN: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
export function roman(n: number, upper = false): string {
  let out = '';
  let rest = Math.max(1, Math.min(n, 39));
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return upper ? out.toUpperCase() : out;
}

/** 内置角色的 id 就是拼音（lin-wanzhao → Lin Wanzhao）；用户角色没有拉丁名 */
export function latinName(character: { id: string; ownerId: number | null; name?: string }): string | null {
  if (character.ownerId !== null) return null;
  // 英文界面的种子角色名字本身就是拼音，不再重复
  if (character.name && !/[\u4e00-\u9fff]/.test(character.name)) return null;
  if (!/^[a-z]+(-[a-z]+)*$/.test(character.id)) return null;
  const parts = character.id.split('-');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // 姓 + 名：lin-wanzhao → Lin Wanzhao；a-heng → A Heng
  return parts.map(cap).join(' ');
}

/** “2.1 万” / “9,412” → 数字 */
export function parseCount(raw: string): number {
  const text = String(raw ?? '').replace(/,/g, '').trim();
  const match = text.match(/([\d.]+)\s*(万|k|K)?/);
  if (!match) return 0;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;
  if (match[2] === '万') return Math.round(value * 10000);
  if (match[2] === 'k' || match[2] === 'K') return Math.round(value * 1000);
  return Math.round(value);
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** 去掉 RP 标记，给摘要用 */
export function plain(text: string | null | undefined): string {
  return String(text ?? '')
    .replace(/\(\([^)]*\)\)|（（[^）]*））/g, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 取第一句或前 n 字 */
export function excerpt(text: string | null | undefined, max = 64): string {
  const clean = plain(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('」'), cut.lastIndexOf('！'), cut.lastIndexOf('？'));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut}……`;
}
