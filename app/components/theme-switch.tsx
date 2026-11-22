'use client';

import { syncPref } from '@/components/sync-prefs';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Theme } from '@/lib/theme';

const OPTIONS: { id: Theme; label: string; hint?: string }[] = [
  { id: 'folio', label: '书页', hint: '纸页衬线' },
  { id: 'nocturne', label: '夜幕', hint: '电影感' },
  { id: 'stage', label: '戏台', hint: '卡牌轻快' },
];

export function setThemeCookie(next: Theme) {
  document.cookie = `tavern_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  void syncPref('theme', next);
}

// 主题样式按主题拆分（scripts/build-css.mjs），切换前先把新主题的样式加载好，
// 插在当前主题样式旁边（同一 precedence 分组），保持层叠顺序；React 刷新时会直接沿用这个 <link>。
function ensureThemeCss(next: Theme): Promise<void> {
  const href = (window as Window & { __YH_THEME_CSS?: Record<string, string> }).__YH_THEME_CSS?.[next];
  if (!href) return Promise.resolve();
  const found = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find((l) => l.getAttribute('href') === href);
  if (found) return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-precedence', 'yh-theme');
  const group = document.querySelectorAll('link[data-precedence="yh-theme"]');
  const last = group[group.length - 1];
  const post = document.querySelector('link[data-precedence="yh-post"]');
  if (last) last.after(link);
  else if (post) post.before(link);
  else document.head.appendChild(link);
  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    window.setTimeout(done, 4000);
  });
}

export function ThemeSwitch({ initial, variant = 'pill' }: { initial: Theme; variant?: 'pill' | 'cards' }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => setTheme(initial), [initial]);
  const themeRef = useRef<Theme>(initial);

  const choose = (next: Theme) => {
    if (next === theme) return;
    setThemeCookie(next);
    setTheme(next);
    themeRef.current = next;
    void ensureThemeCss(next).then(() => run());
  };
  const run = () => {
    const next = themeRef.current;
    const apply = () => {
      document.body.dataset.theme = next;
      router.refresh();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || Boolean(document.body.dataset.uMotion);
    if (doc.startViewTransition && !reduce) doc.startViewTransition(apply);
    else apply();
  };

  if (variant === 'cards') {
    return (
      <div className="th-picker" role="radiogroup" aria-label="界面主题">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            className={`th-picker-item th-picker-item--${option.id}${theme === option.id ? ' is-active' : ''}`}
            onClick={() => choose(option.id)}
          >
            <span className="th-picker-swatch" aria-hidden="true">
              <i className="th-mini-bar" /><i className="th-mini-line" /><i className="th-mini-line th-mini-line--short" /><i className="th-mini-bubble" />
            </span>
            <span className="th-picker-name">{option.label}</span>
            {option.hint && <span className="th-picker-hint">{option.hint}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="th-switch p-view-switch" role="radiogroup" aria-label="界面主题">
      {OPTIONS.map((option) => (
        <button key={option.id} type="button" role="radio" aria-checked={theme === option.id} aria-pressed={theme === option.id} onClick={() => choose(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
