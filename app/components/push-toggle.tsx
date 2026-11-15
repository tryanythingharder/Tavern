'use client';

import { useEffect, useState } from 'react';

// 通知页顶部的「系统推送」开关：本设备订阅 / 取消，并能发一条测试推送。
// 依赖 Service Worker（只在生产环境注册）。iPhone 需要先「添加到主屏幕」再从主屏图标打开才能开启。

type State = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'dev';

function urlBase64ToBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function call(method: string, body?: unknown) {
  const response = await fetch('/api/me/push', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message || '请求失败');
  return data as { publicKey?: string; devices?: number };
}

export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setState(ios && !standalone ? 'ios-install' : 'unsupported');
        return;
      }
      if (process.env.NODE_ENV !== 'production') { setState('dev'); return; }
      if (Notification.permission === 'denied') { setState('denied'); return; }
      try {
        const info = await call('GET');
        setDevices(info.devices ?? 0);
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setState(existing ? 'on' : 'off');
      } catch { setState('off'); }
    })();
  }, []);

  const enable = async () => {
    setBusy(true); setNote('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'denied' : 'off'); return; }
      const { publicKey } = await call('GET');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(publicKey ?? '') as BufferSource });
      const saved = await call('POST', { subscription: subscription.toJSON() });
      setDevices(saved.devices ?? 1);
      setState('on');
      await call('POST', { test: true });
      setNote('已发一条测试推送。');
    } catch (error) {
      setNote(error instanceof Error ? error.message : '开启失败');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setNote('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const left = await call('DELETE', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        setDevices(left.devices ?? 0);
      }
      setState('off');
    } catch (error) {
      setNote(error instanceof Error ? error.message : '关闭失败');
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setNote('');
    try { await call('POST', { test: true }); setNote('已发送，几秒内会弹出。'); }
    catch (error) { setNote(error instanceof Error ? error.message : '发送失败'); }
    finally { setBusy(false); }
  };

  if (state === 'loading') return null;

  const hint: Record<State, string> = {
    loading: '',
    unsupported: '这个浏览器不支持系统推送，站内通知照常显示在这里。',
    'ios-install': 'iPhone 上要先用 Safari「分享 → 添加到主屏幕」，再从主屏图标打开酒馆，才能开启推送。',
    denied: '浏览器已拒绝通知。去浏览器的网站设置里把「通知」改为允许，再回来开启。',
    off: '新作品上架、点数到账、审核结果会弹系统通知，关掉页面也能收到。',
    on: `本设备已开启${devices > 1 ? `（这个账号共 ${devices} 台设备）` : ''}。`,
    dev: '开发环境不注册 Service Worker，推送要在正式环境里开启。',
  };

  return (
    <section className="p-card p-card--pad push-card" aria-label="系统推送">
      <div className="push-row">
        <div>
          <b>系统推送</b>
          <p className="p-small">{hint[state]}{note ? ` ${note}` : ''}</p>
        </div>
        <div className="push-actions">
          {state === 'off' && <button type="button" className="p-btn p-btn--sm p-btn--primary" disabled={busy} onClick={() => void enable()}>{busy ? '开启中…' : '开启推送'}</button>}
          {state === 'on' && (
            <>
              <button type="button" className="p-btn p-btn--sm" disabled={busy} onClick={() => void test()}>发一条测试</button>
              <button type="button" className="p-btn p-btn--sm" disabled={busy} onClick={() => void disable()}>关闭</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
