'use client';

import { useEffect } from 'react';

// 把浏览器里未捕获的异常发到 /api/client-error；同一条消息只报一次
export function sendClientError(message: string, stack?: string) {
  try {
    const body = JSON.stringify({ message, stack, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  } catch {
    // 上报失败不影响页面
  }
}

export function ErrorReporter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const seen = new Set<string>();
    const report = (message: string, stack?: string) => {
      if (!message || seen.has(message) || seen.size > 20) return;
      // 浏览器扩展和跨域脚本的噪音不报
      if (/ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:/.test(message + (stack ?? ''))) return;
      seen.add(message);
      sendClientError(message, stack);
    };
    const onError = (event: ErrorEvent) => report(event.message, event.error?.stack);
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as Error | string | undefined;
      if (reason && typeof reason === 'object' && reason.name === 'AbortError') return;
      report(typeof reason === 'string' ? reason : reason?.message ?? 'unhandledrejection', typeof reason === 'object' ? reason?.stack : undefined);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}
