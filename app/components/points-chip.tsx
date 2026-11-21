'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { onPoints } from '@/lib/points-bus';

type Burst = { key: number; cost: number; free: number };

const fmt = (value: number) => Math.round(value).toLocaleString('zh-CN');
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// 对话页左上角的余额小标：每次扣点数字滚动减少，旁边飘一个「−N」。
// 顶部栏被收起（沉浸模式往下读）时，改在左上角浮出一个小提示，几秒后消失。
export function PointsChip({ initial, low = 200 }: { initial: number; low?: number }) {
  const [shown, setShown] = useState(initial);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [float, setFloat] = useState<Burst & { balance: number } | null>(null);
  const valueRef = useRef(initial);
  const chipRef = useRef<HTMLAnchorElement | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    let seq = 0;
    let floatTimer: ReturnType<typeof setTimeout> | undefined;
    const off = onPoints(({ balance, cost, free }) => {
      const from = valueRef.current;
      valueRef.current = balance;
      cancelAnimationFrame(frameRef.current);
      if (reduced() || from === balance) setShown(balance);
      else {
        const start = performance.now();
        const span = 700;
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / span);
          const eased = 1 - Math.pow(1 - t, 3);
          setShown(from + (balance - from) * eased);
          if (t < 1) frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
      }
      if (cost <= 0 && !free) return;
      const burst = { key: ++seq, cost, free: free ?? 0 };
      setBursts((list) => [...list.slice(-2), burst]);
      setTimeout(() => setBursts((list) => list.filter((item) => item.key !== burst.key)), 1600);
      // 小标不在视口里（顶栏收起了）就浮出提示
      const rect = chipRef.current?.getBoundingClientRect();
      const hidden = !rect || rect.bottom <= 0 || rect.width === 0 || getComputedStyle(chipRef.current!).visibility === 'hidden';
      if (hidden) {
        setFloat({ ...burst, balance });
        clearTimeout(floatTimer);
        floatTimer = setTimeout(() => setFloat(null), 2600);
      }
    });
    return () => { off(); cancelAnimationFrame(frameRef.current); clearTimeout(floatTimer); };
  }, []);

  const isLow = valueRef.current < low;
  const label = (b: Burst) => (b.cost > 0 ? `−${fmt(b.cost)}` : '免费');
  return (
    <>
      <Link ref={chipRef} href="/me/points" className={`pc-chip${isLow ? ' is-low' : ''}`} aria-label={`剩余点数 ${fmt(valueRef.current)}，点开查看明细`} title="剩余点数">
        <span className="pc-coin" aria-hidden="true">点</span>
        <span className="pc-num" aria-hidden="true">{fmt(shown)}</span>
        <span className="pc-bursts" aria-hidden="true">
          {bursts.map((b) => <span key={b.key} className={`pc-burst${b.cost > 0 ? '' : ' is-free'}`}>{label(b)}</span>)}
        </span>
      </Link>
      <span className="pc-live" role="status" aria-live="polite">{bursts.length ? `本次消耗 ${bursts[bursts.length - 1].cost} 点，剩余 ${fmt(valueRef.current)}` : ''}</span>
      {float && (
        <div className="pc-float" key={float.key} aria-hidden="true">
          <span className="pc-coin">点</span>
          <span className="pc-float-cost">{label(float)}</span>
          <span className="pc-float-left">余 {fmt(float.balance)}</span>
        </div>
      )}
    </>
  );
}
