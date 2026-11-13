'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

// 全站动效层（不渲染业务内容）：
// 1. 顶部路由进度条：点内链时开始，路径变化后收尾
// 2. 页面入场：路径变化时主区淡入上移
// 3. 卡片光斑：鼠标在卡片上移动时更新 --mx/--my，CSS 画一层柔光
// 4. 顶栏滚动态：页面滚动后给 body 加 is-scrolled，顶栏出现毛玻璃与阴影
// 所有效果在 prefers-reduced-motion 下由 CSS 关闭。


function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState('loading');
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      if (form?.method?.toLowerCase() === 'get' && form.action) setState('loading');
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  useEffect(() => {
    setState((current) => (current === 'loading' ? 'done' : current));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 420);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname, search]);

  return <div className={`rd-progress is-${state}`} aria-hidden="true" />;
}

export function MotionLayer() {
  const pathname = usePathname();

  // 页面切换：主区播放一次入场动画。用 Web Animations API，不改 React 管理的 class/attribute，
  // 避免和 hydration 冲突。滚动入场交给 CSS 的 animation-timeline: view()（见 redesign.css）。
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const main = document.querySelector<HTMLElement>('.p-main > .p-inner, .p-main > main, .cinema-main, .p-amain > :not(.p-atabs)');
    if (!main || typeof main.animate !== 'function') return;
    const animation = main.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 560, easing: 'cubic-bezier(.16, 1, .3, 1)' },
    );
    return () => animation.cancel();
  }, [pathname]);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest?.('.p-work, .ca-rec, .ca-scene, .p-continue-card, .rd-glow') as HTMLElement | null;
      if (!card) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      });
    };
    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const scroller = document.querySelector('.p-main');
      const y = Math.max(window.scrollY, scroller instanceof HTMLElement ? scroller.scrollTop : 0);
      document.body.classList.toggle('is-scrolled', y > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [pathname]);

  return (
    <Suspense fallback={null}>
      <RouteProgress />
    </Suspense>
  );
}
