'use client';

import { useEffect, useRef, useState } from 'react';
import type { RosterEntry } from '@/lib/auth-wall';

// 登录页「名册」：一列角色名索引，划过（或自动轮到）哪一行，立绘就浮到那一行旁边。
// 纯装饰（aria-hidden），不可聚焦；减少动态效果时不自动轮播、不做位移动画。
export function AuthRoster({ entries }: { entries: RosterEntry[] }) {
  const [active, setActive] = useState(0);
  const [y, setY] = useState(0);
  const hover = useRef(false);
  const listRef = useRef<HTMLOListElement>(null);
  const frameRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || entries.length < 2) return;
    const t = window.setInterval(() => {
      if (hover.current) return;
      // 只轮到看得见的行（手机上只显示前几行）
      const visible = Array.from(listRef.current?.children ?? []).filter((el) => (el as HTMLElement).offsetParent !== null).length || entries.length;
      setActive((a) => (a + 1) % visible);
    }, 2600);
    return () => window.clearInterval(t);
  }, [entries.length]);

  useEffect(() => {
    const place = () => {
      const list = listRef.current;
      const row = list?.children[active] as HTMLElement | undefined;
      const fh = frameRef.current?.offsetHeight ?? 0;
      if (!list || !row) return;
      const max = Math.max(0, list.offsetHeight - fh);
      setY(Math.min(max, Math.max(0, row.offsetTop + row.offsetHeight / 2 - fh / 2)));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="p-roster" data-few={entries.length <= 6 ? '' : undefined} style={{ ['--roster-y' as string]: `${y}px` }}>
      <div className="p-roster-head">
        <span>名册 · INDEX</span>
        <span>{pad(entries.length)} 位角色 · 今晚在线</span>
      </div>
      <div className="p-roster-body">
        <ol className="p-roster-list" ref={listRef} onMouseLeave={() => { hover.current = false; }}>
          {entries.map((e, i) => (
            <li
              key={e.id}
              className="p-roster-row"
              data-active={i === active ? '' : undefined}
              onMouseEnter={() => { hover.current = true; setActive(i); }}
            >
              <span className="p-roster-no">{pad(i + 1)}</span>
              <span className="p-roster-name">{e.name}</span>
              <span className="p-roster-cat">{e.category}</span>
              <span className="p-roster-by">{e.author}</span>
            </li>
          ))}
        </ol>
        <figure className="p-roster-frame" ref={frameRef}>
          {entries.map((e, i) => (
            <img key={e.id} src={e.src} alt="" data-active={i === active ? '' : undefined} loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
          ))}
          <figcaption>{pad(active + 1)} / {pad(entries.length)}</figcaption>
        </figure>
      </div>
      <p className="p-roster-foot">夜深了，故事才刚开始。</p>
    </div>
  );
}
