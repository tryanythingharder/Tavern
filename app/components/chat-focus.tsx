'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHAT_FOCUS_KEY, CHAT_PORTRAIT_KEY } from '@/lib/chat-focus';

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
    const root = document.documentElement;
    apply(stored(richCard));
    if (richCard) root.setAttribute('data-chat-rich', '');
    else root.removeAttribute('data-chat-rich');
    return () => { root.removeAttribute('data-chat-focus'); root.removeAttribute('data-chat-rich'); };
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

// 沉浸时左侧立绘的开关：只给普通卡（带 HTML 美化的卡自己会在消息里放立绘、插图、状态栏，
// 侧边再放一张会挤窄正文）。默认关，打开后记住。只在沉浸模式、宽屏、角色有封面时显示。
export function ChatPortraitToggle() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.documentElement.hasAttribute('data-chat-portrait'));
    return () => document.documentElement.removeAttribute('data-chat-portrait');
  }, []);
  const toggle = () => {
    const next = !on;
    const root = document.documentElement;
    if (next) root.setAttribute('data-chat-portrait', '');
    else root.removeAttribute('data-chat-portrait');
    try { localStorage.setItem(CHAT_PORTRAIT_KEY, next ? '1' : '0'); } catch { /* 隐私模式 */ }
    setOn(next);
  };
  return (
    <button className="btn btn--sm chat-portrait-btn" type="button" aria-pressed={on} onClick={toggle}
      title={on ? '收起立绘' : '显示立绘'}>
      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="1.5" /><circle cx="12" cy="10" r="3" /><path d="M7 19c1-3 3-4.5 5-4.5s4 1.5 5 4.5" />
      </svg>
      <span>立绘</span>
    </button>
  );
}

// 沉浸时顶栏自动收起：往下读时收起，往上滚、鼠标移到顶部、顶栏里有焦点或有弹窗时出现。
export function ChatFocusChrome() {
  useEffect(() => {
    const root = document.documentElement;
    const head = document.querySelector<HTMLElement>('.p-chat-head');
    if (!head) return;
    const measure = () => root.style.setProperty('--chat-head-h', `${head.offsetHeight || 52}px`);
    measure();
    const hide = (yes: boolean) => {
      if (!root.hasAttribute('data-chat-focus')) yes = false;
      const dialogOpen = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].some((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0);
      if (yes && (head.matches(':focus-within') || dialogOpen)) yes = false;
      if (yes) root.setAttribute('data-chat-head-hide', '');
      else root.removeAttribute('data-chat-head-hide');
    };
    // 只认用户自己滚动（滚轮、触摸、键盘），首屏自动滚到最新、新消息跟随不算
    let userAt = 0;
    const markUser = () => { userAt = Date.now(); };
    let last = -1;
    const onScroll = (event: Event) => {
      if (Date.now() - userAt > 800) { last = -1; return; }
      const el = event.target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement) || !el.classList.contains('p-chat-scroll')) return;
      const y = el.scrollTop;
      if (last >= 0) {
        if (y > last + 24 && y > 120) { hide(true); last = y; }
        else if (y < last - 24) { hide(false); last = y; }
      } else last = y;
    };
    const onMove = (event: MouseEvent) => { if (event.clientY < 64) hide(false); };
    const onFocus = () => { if (head.matches(':focus-within')) hide(false); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('wheel', markUser, { passive: true });
    window.addEventListener('touchmove', markUser, { passive: true });
    window.addEventListener('keydown', markUser);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('resize', measure);
    document.addEventListener('focusin', onFocus);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('wheel', markUser);
      window.removeEventListener('touchmove', markUser);
      window.removeEventListener('keydown', markUser);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', onFocus);
      root.removeAttribute('data-chat-head-hide');
    };
  }, []);
  // 顶部感应条：顶栏收起时盖在最上面，鼠标碰到就出现（卡里的 HTML 是 iframe，鼠标事件到不了页面）
  const reveal = () => document.documentElement.removeAttribute('data-chat-head-hide');
  return <div className="chat-head-hotzone" aria-hidden="true" onMouseEnter={reveal} onMouseMove={reveal} />;
}
