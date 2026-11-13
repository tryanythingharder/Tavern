'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Theme } from '@/lib/theme';

const OPTIONS: { id: Theme; label: string }[] = [
  { id: 'folio', label: '书页' },
  { id: 'nocturne', label: '夜幕' },
  { id: 'stage', label: '戏台' },
];

export function setThemeCookie(next: Theme) {
  document.cookie = `tavern_theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

export function ThemeSwitch({ initial, variant = 'pill' }: { initial: Theme; variant?: 'pill' | 'cards' }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initial);

  const choose = (next: Theme) => {
    if (next === theme) return;
    setThemeCookie(next);
    setTheme(next);
    const apply = () => {
      document.body.dataset.theme = next;
      router.refresh();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
            <span className="th-picker-swatch" aria-hidden="true" />
            <span className="th-picker-name">{option.label}</span>
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
