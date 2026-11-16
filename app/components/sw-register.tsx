'use client';

import { useEffect } from 'react';

// 只在生产环境注册 Service Worker；开发环境会注销旧的，避免缓存干扰热更新。
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => void r.unregister())).catch(() => {});
      return;
    }
    const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
