'use client';

import { useState } from 'react';
import { syncPref } from '@/components/sync-prefs';
import { currentLocale } from '@/lib/i18n/runtime';
import type { Locale } from '@/lib/i18n/core';

const OPTIONS: { id: Locale; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
];

/** 切换界面语言：写 cookie、同步到账号（已登录时），再整页刷新让服务端按新语言渲染 */
export function setLocale(locale: Locale) {
  document.cookie = `tavern_lang=${locale}; path=/; max-age=31536000; samesite=lax`;
  void syncPref('lang', locale, true).finally(() => window.location.reload());
}

export function LanguageSwitch({ variant = 'seg' }: { variant?: 'seg' | 'link' }) {
  const [busy, setBusy] = useState(false);
  const now = currentLocale();
  if (variant === 'link') {
    const other = OPTIONS.find((o) => o.id !== now)!;
    return (
      <button type="button" className="lang-link" lang={other.id === 'en' ? 'en' : 'zh-CN'} data-no-i18n="" disabled={busy} onClick={() => { setBusy(true); setLocale(other.id); }}>
        {other.label}
      </button>
    );
  }
  return (
    <div className="ua-row">
      <span className="ua-label" data-no-i18n="">语言 · Language</span>
      <div className="ua-seg" role="radiogroup" aria-label="Language">
        {OPTIONS.map((option) => (
          <button key={option.id} type="button" role="radio" data-no-i18n="" aria-checked={now === option.id} className={now === option.id ? 'is-on' : undefined} disabled={busy} onClick={() => { if (option.id !== now) { setBusy(true); setLocale(option.id); } }}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
