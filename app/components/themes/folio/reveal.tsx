'use client';

import { useEffect } from 'react';

// 滚动错峰：.fo-reveal 进入视口时加 .is-in。没有 JS 时 CSS 保持可见（只有 .fo-js 下才隐藏）。
export function FolioReveal() {
  useEffect(() => {
    const root = document.querySelector('.fo-home');
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mark = () => root.querySelectorAll('.fo-reveal:not(.is-in)');
    if (reduce || !('IntersectionObserver' in window)) {
      mark().forEach((el) => el.classList.add('is-in'));
      return;
    }
    root.classList.add('fo-js');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      }),
      { rootMargin: '0px 0px 20% 0px' },
    );
    const observe = () => mark().forEach((el) => io.observe(el));
    observe();
    // 目录筛选后新出现的行也要观察
    const mo = new MutationObserver(observe);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
