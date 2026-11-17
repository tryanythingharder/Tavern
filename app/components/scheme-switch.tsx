'use client';

import { useEffect, useState } from 'react';
import { syncPref } from '@/components/sync-prefs';
import type { Scheme } from '@/lib/theme';

const OPTIONS: { id: Scheme; label: string }[] = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟随系统' },
];

function readScheme(): Scheme {
  const v = document.documentElement.dataset.schemePref;
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** 把明暗应用到 <html>：data-scheme 为实际生效值，data-scheme-pref 为用户选择 */
export function applyScheme(next: Scheme) {
  const root = document.documentElement;
  root.dataset.schemePref = next;
  const dark = next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.scheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#151413' : '#ffffff');
}

export function setScheme(next: Scheme) {
  document.cookie = `tavern_scheme=${next}; path=/; max-age=31536000; samesite=lax`;
  void syncPref('scheme', next);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(document.body.dataset.uMotion);
  if (doc.startViewTransition && !reduce) doc.startViewTransition(() => applyScheme(next));
  else applyScheme(next);
  window.dispatchEvent(new CustomEvent('tavern-scheme', { detail: next }));
}

function useScheme(): [Scheme, (s: Scheme) => void] {
  const [scheme, set] = useState<Scheme>('system');
  useEffect(() => {
    set(readScheme());
    const on = (e: Event) => set((e as CustomEvent<Scheme>).detail);
    window.addEventListener('tavern-scheme', on);
    return () => window.removeEventListener('tavern-scheme', on);
  }, []);
  return [scheme, (s) => { set(s); setScheme(s); }];
}

export function SchemeSwitch() {
  const [scheme, choose] = useScheme();
  return (
    <div className="sc-switch" role="radiogroup" aria-label="明暗">
      {OPTIONS.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={scheme === o.id} onClick={() => choose(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SUN = 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42';
const MOON = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z';

/** 顶栏一键切换：在浅色和深色之间切（以当前实际生效的为准） */
export function SchemeToggle({ className = '' }: { className?: string }) {
  const [, choose] = useScheme();
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.scheme === 'dark');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-scheme'] });
    return () => obs.disconnect();
  }, []);
  return (
    <button
      type="button"
      className={`sc-toggle ${className}`.trim()}
      aria-label={dark ? '切换到浅色' : '切换到深色'}
      title={dark ? '切换到浅色' : '切换到深色'}
      onClick={() => choose(dark ? 'light' : 'dark')}
    >
      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={dark ? SUN : MOON} /></svg>
    </button>
  );
}
