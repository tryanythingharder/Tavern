'use client';

import { syncPref } from '@/components/sync-prefs';

import { useSyncExternalStore } from 'react';
import {
  APPEARANCE_COOKIE,
  DEFAULT_APPEARANCE,
  appearanceBodyProps,
  parseAppearanceCookie,
  sanitizeAppearance,
  serializeAppearance,
  type AppearancePrefs,
} from '@/lib/appearance';

// 外观偏好的客户端单一来源：抽屉和 /me/appearance 页面共用，改动即时套到 body 并写回 cookie。

let current: AppearancePrefs | null = null;
const listeners = new Set<() => void>();

function readCookie(): AppearancePrefs {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${APPEARANCE_COOKIE}=`));
  return parseAppearanceCookie(match ? match.slice(APPEARANCE_COOKIE.length + 1) : '');
}

function snapshot(): AppearancePrefs {
  if (!current) current = readCookie();
  return current;
}


export function applyAppearanceToBody(prefs: AppearancePrefs) {
  const body = document.body;
  const { data, vars } = appearanceBodyProps(prefs);
  for (const attr of Array.from(body.attributes)) {
    if (attr.name.startsWith('data-u-') && !(attr.name in data)) body.removeAttribute(attr.name);
  }
  for (let i = body.style.length - 1; i >= 0; i -= 1) {
    const prop = body.style[i];
    if (prop.startsWith('--u-') && !(prop in vars)) body.style.removeProperty(prop);
  }
  Object.entries(data).forEach(([name, value]) => body.setAttribute(name, value));
  Object.entries(vars).forEach(([name, value]) => body.style.setProperty(name, value));
}

export function setAppearance(patch: Partial<AppearancePrefs>) {
  const next = sanitizeAppearance({ ...snapshot(), ...patch });
  current = next;
  const value = serializeAppearance(next);
  document.cookie = value
    ? `${APPEARANCE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
    : `${APPEARANCE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  applyAppearanceToBody(next);
  void syncPref('appearance', value);
  listeners.forEach((listener) => listener());
}

export function resetAppearance(keys?: (keyof AppearancePrefs)[]) {
  if (!keys) return setAppearance({ ...DEFAULT_APPEARANCE });
  const patch: Partial<AppearancePrefs> = {};
  keys.forEach((key) => { (patch as Record<string, unknown>)[key] = DEFAULT_APPEARANCE[key]; });
  setAppearance(patch);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// initial：服务端从 cookie 读出的值，保证 SSR 与首帧一致
export function useAppearance(initial?: AppearancePrefs): AppearancePrefs {
  return useSyncExternalStore(subscribe, snapshot, () => initial ?? DEFAULT_APPEARANCE);
}

export const OPEN_APPEARANCE_EVENT = 'tavern:appearance';
export function openAppearanceDrawer() {
  window.dispatchEvent(new Event(OPEN_APPEARANCE_EVENT));
}
