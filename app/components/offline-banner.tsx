'use client';

import { useEffect, useState } from 'react';

// 断网提示：离线时顶部常驻一条，恢复后短暂显示「已恢复」
export function OfflineBanner() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  useEffect(() => {
    if (!navigator.onLine) setState('offline');
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = () => { clearTimeout(t); setState('offline'); };
    const on = () => { setState('back'); t = setTimeout(() => setState('online'), 2400); };
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { clearTimeout(t); window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, []);
  if (state === 'online') return null;
  return (
    <div className={`net-banner is-${state}`} role="status" aria-live="polite">
      {state === 'offline' ? '网络已断开，消息暂时发不出去。恢复后可点「重试」。' : '网络已恢复'}
    </div>
  );
}
