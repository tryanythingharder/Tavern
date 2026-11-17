// 把界面偏好同步到账号（未登录时接口返回 401，忽略即可）
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Record<string, string> = {};

export function syncPref(key: 'lang' | 'theme' | 'mode' | 'appearance' | 'scheme', value: string, immediate = false): Promise<void> {
  pending[key] = value;
  if (timer) clearTimeout(timer);
  const send = () => {
    const body = pending;
    pending = {};
    timer = null;
    return fetch('/api/me/prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(() => undefined)
      .catch(() => undefined);
  };
  if (immediate) return send();
  timer = setTimeout(() => void send(), 600);
  return Promise.resolve();
}
