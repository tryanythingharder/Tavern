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
    // 兜底：快速滚动或锚点跳转会“跳过”元素（从没和视口相交），凡是顶端已经到视口里或在视口之上的都直接显示；打印时全部显示
    let raf = 0;
    const sweep = () => {
      raf = 0;
      const limit = window.innerHeight * 1.1;
      mark().forEach((el) => { if (el.getBoundingClientRect().top < limit) { el.classList.add('is-in'); io.unobserve(el); } });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep); };
    const showAll = () => mark().forEach((el) => el.classList.add('is-in'));
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('hashchange', onScroll);
    window.addEventListener('beforeprint', showAll);
    // 目录筛选后新出现的行也要观察
    const mo = new MutationObserver(observe);
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('hashchange', onScroll);
      window.removeEventListener('beforeprint', showAll);
    };
  }, []);
  return null;
}
