'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAT_FOCUS_KEY } from '@/lib/chat-focus';

// 沉浸模式：收起站点导航和主题两侧栏，对话铺满，留给卡里自带的立绘、插图、状态栏。
// 选择存在 localStorage（全站一个开关）；没选过时，带 HTML 美化的卡默认打开。
// <html data-chat-focus> 由首屏内联脚本先设好，避免闪一下三栏。
const KEY = CHAT_FOCUS_KEY;

function stored(richCard: boolean): boolean {
  try {
    const value = localStorage.getItem(KEY);
    return value ? value === '1' : richCard;
  } catch {
    return richCard;
  }
}

export function ChatFocusToggle({ richCard }: { richCard: boolean }) {
  const [on, setOn] = useState(false);

  const apply = useCallback((next: boolean) => {
    const root = document.documentElement;
    if (next) root.setAttribute('data-chat-focus', '');
    else root.removeAttribute('data-chat-focus');
    setOn(next);
  }, []);

  useEffect(() => {
    apply(stored(richCard));
    return () => document.documentElement.removeAttribute('data-chat-focus');
  }, [apply, richCard]);

  const toggle = useCallback(() => {
    const next = !document.documentElement.hasAttribute('data-chat-focus');
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* 隐私模式 */ }
    apply(next);
  }, [apply]);

  // 快捷键：不在输入框里时按 F 切换
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'f' && event.key !== 'F') return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <button className="btn btn--sm chat-focus-btn" type="button" aria-pressed={on} onClick={toggle}
      title={on ? '退出沉浸（F）' : '沉浸模式：收起导航和侧栏（F）'} aria-label={on ? '退出沉浸模式' : '沉浸模式'}>
      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
        {on
          ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
      </svg>
      <span className="chat-focus-label">{on ? '退出沉浸' : '沉浸'}</span>
    </button>
  );
}
