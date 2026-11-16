import { currentLocale } from '@/lib/i18n/runtime';
// 戏台主题的小工具：只做展示层的格式化，不查询数据。

const CATEGORY_EN: Record<string, string> = {
  悬疑: 'a slow-burn mystery',
  奇幻: 'a tale of wonder',
  现代: 'a modern drama',
  治愈: 'a gentle healing story',
};

export function categoryLine(category: string): string {
  return CATEGORY_EN[category] ?? 'tonight on stage';
}

/** 「慢热 · 细节叙事 · 重视长期关系」→「慢热」 */
export function shortPace(pace: string): string {
  return (pace || '').split(/[·・,，/]/)[0]?.trim() || '自由';
}

/** 「2.1 万」→ 21000；「9,412」→ 9412 */
export function parseCount(raw: string): number {
  const text = (raw || '').replace(/[,\s]/g, '');
  const match = text.match(/([\d.]+)(万|w|k)?/i);
  if (!match) return 0;
  const n = Number(match[1]) || 0;
  const unit = match[2]?.toLowerCase();
  if (unit === '万' || unit === 'w') return Math.round(n * 10000);
  if (unit === 'k') return Math.round(n * 1000);
  return Math.round(n);
}

/** 21000 → 「2.1w」，9412 → 「9.4k」 */
export function stampCount(raw: string): string {
  const n = parseCount(raw);
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** 大数字：≥1 万用「x.x万」 */
export function bigCount(n: number): { value: string; unit: string } {
  if (n >= 10000) {
    if (currentLocale() === 'en') return n >= 1e6 ? { value: String(Math.floor(n / 1e5) / 10), unit: 'M' } : { value: String(Math.floor(n / 100) / 10), unit: 'k' };
    return { value: String(Math.floor(n / 1000) / 10), unit: '万' };
  }
  return { value: n.toLocaleString('en-US'), unit: '' };
}

/** 去掉 RP 标记，给摘要、预览用 */
export function plain(text: string | null | undefined): string {
  return (text || '')
    .replace(/\*\*?([^*\n]+)\*\*?/g, '$1')
    .replace(/\(\([^)]*\)\)|（（[^）]*））/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 名字越长字越小，保证巨字不至于撑破版面 */
export function giantSize(name: string, max: number, budget: number): number {
  const len = Math.max(3, Array.from(name).length);
  return Math.min(max, Math.floor(budget / len));
}

const NUMERALS = ['序', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function actNumeral(i: number): string {
  return NUMERALS[i] ?? String(i);
}
