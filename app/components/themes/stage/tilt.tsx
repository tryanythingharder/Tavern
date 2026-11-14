'use client';

import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react';

// 3D 指针倾斜：只写 CSS 变量（--rx/--ry/--mx/--my），具体 transform 由 stage.css 拼装，
// 这样卡片原本的歪斜角度（--rot）不会被覆盖。触屏和「减少动态效果」下不启用。
export function Tilt({
  children,
  className,
  strength = 1,
  style,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (reduce || !fine) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.classList.add('is-tilting');
        el.style.setProperty('--rx', `${((0.5 - y) * 14 * strength).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((x - 0.5) * 16 * strength).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [strength]);

  return (
    <div ref={ref} className={`stg-tilt${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}
