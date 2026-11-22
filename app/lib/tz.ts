// 时区：两种「一天」。
// 1. 平台日（签到、每日免费额度、每日 token 上限、后台「今日」）：全站统一一个时区，默认 UTC，可用 TAVERN_TIMEZONE 改。
//    用平台日是为了防刷：如果按玩家自己报的时区算，改一下时区就能多签一次到。
// 2. 玩家日（创作者统计、点数明细按天分组）：只影响展示，按浏览器上报的时区（cookie tavern_tz）算。

export const TZ_COOKIE = 'tavern_tz';

function validZone(tz: string | undefined | null): string | null {
  if (!tz || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}

export const PLATFORM_TZ = validZone(process.env.TAVERN_TIMEZONE) || 'UTC';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

function parts(ms: number, tz: string) {
  const o: Record<string, number> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second };
}

// 该时区在 ms 这一刻相对 UTC 的偏移（毫秒）
function offset(ms: number, tz: string): number {
  const p = parts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** YYYY-MM-DD，ms 这一刻在 tz 里的日期 */
export function dayKeyIn(ms: number, tz: string = PLATFORM_TZ): string {
  const p = parts(ms, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** ms 所在那一天在 tz 里的零点（UTC 毫秒） */
export function startOfDayIn(ms: number, tz: string = PLATFORM_TZ): number {
  const p = parts(ms, tz);
  const guess = Date.UTC(p.y, p.m - 1, p.d) - offset(ms, tz);
  // 夏令时切换当天偏移可能不同，用零点附近的偏移再校一次
  return Date.UTC(p.y, p.m - 1, p.d) - offset(guess, tz);
}

/** 往前/后挪 n 个自然日后的日期键 */
export function shiftDayKey(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export const platformToday = () => dayKeyIn(Date.now(), PLATFORM_TZ);
export const platformDayStart = () => startOfDayIn(Date.now(), PLATFORM_TZ);

/** 服务端读取玩家时区（展示用），读不到就用平台时区 */
export async function requestTimeZone(): Promise<string> {
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    return validZone(decodeURIComponent(jar.get(TZ_COOKIE)?.value || '')) || PLATFORM_TZ;
  } catch {
    return PLATFORM_TZ;
  }
}
