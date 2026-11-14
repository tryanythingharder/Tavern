'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppearancePanel } from '@/components/appearance-panel';
import { OPEN_APPEARANCE_EVENT, openAppearanceDrawer, resetAppearance, useAppearance } from '@/components/appearance-store';
import { isDefaultAppearance, type AppearancePrefs } from '@/lib/appearance';
import type { Theme } from '@/lib/theme';

const PALETTE_ICON = 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.6-4-8.2-9-8.2ZM7.5 12a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm3-4a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm5 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z';

// 顶栏「外观」按钮：只负责发事件，抽屉本身全站只挂一份（在 SiteShell 里）
export function AppearanceButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" className={`ua-trigger ${className}`.trim()} aria-haspopup="dialog" onClick={openAppearanceDrawer}>
      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={PALETTE_ICON} /></svg>
      <span className="ua-trigger-label">外观</span>
    </button>
  );
}

export function AppearanceDrawer({ theme, initial }: { theme: Theme; initial?: AppearancePrefs }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const prefs = useAppearance(initial);

  useEffect(() => {
    const onOpen = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setClosing(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_APPEARANCE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_APPEARANCE_EVENT, onOpen);
  }, []);

  const close = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.dataset.uMotion === 'off';
    if (reduce) { setOpen(false); return; }
    setClosing(true);
    window.setTimeout(() => { setOpen(false); setClosing(false); }, 200);
  };

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel?.querySelector<HTMLElement>('.ua-drawer-close')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      returnFocus.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={`ua-layer${closing ? ' is-closing' : ''}`}>
      <div className="ua-overlay" aria-hidden="true" onClick={close} />
      <div className="ua-drawer" role="dialog" aria-modal="true" aria-labelledby="ua-drawer-title" ref={panelRef}>
        <header className="ua-drawer-head">
          <span className="ua-grip" aria-hidden="true" />
          <div className="ua-drawer-title">
            <h2 id="ua-drawer-title">外观</h2>
            <span>改动即时生效，只影响你自己</span>
          </div>
          <button type="button" className="ua-reset-all ua-reset-all--head" disabled={isDefaultAppearance(prefs)} onClick={() => resetAppearance()}>全部重置</button>
          <button type="button" className="ua-drawer-close" aria-label="关闭外观设置" onClick={close}>
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="ua-drawer-body">
          <AppearancePanel theme={theme} initial={initial} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
