'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// 「设定」面板代码较大，首屏只放按钮；点开（或浏览器空闲时预取）才加载面板本体。
const load = () => import('@/components/chat-settings').then((m) => m.ChatSettings);
const Panel = dynamic(load, { ssr: false, loading: () => <button className="btn btn--sm" type="button" disabled>设定</button> });

export function ChatSettingsLazy({ chatId }: { chatId: number }) {
  const [want, setWant] = useState(false);
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const go = () => { void load(); };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 4000 });
    else window.setTimeout(go, 2500);
  }, []);
  if (want) return <Panel chatId={chatId} initialOpen />;
  return <button className="btn btn--sm" type="button" onClick={() => setWant(true)}>设定</button>;
}
