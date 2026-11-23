// 浏览器端读取 /api/me/gen-prefs：同一时刻多个组件（对话页、思考块）一起要时只发一次请求
type Prefs = Record<string, any>;
let inflight: Promise<Prefs | null> | null = null;

export function fetchGenPrefs(): Promise<Prefs | null> {
  if (inflight) return inflight;
  inflight = fetch('/api/me/gen-prefs', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : null))
    .then((data: { prefs?: Prefs } | null) => data?.prefs ?? null)
    .catch(() => null)
    .finally(() => { setTimeout(() => { inflight = null; }, 1500); });
  return inflight;
}
