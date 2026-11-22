'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { tr } from '@/lib/i18n/runtime';

// 登录 / 注册「五扇门」：照 Thorgal（Awwwards SOTD 2026-05-19，Caracal / REEPLE）的首页复刻版式与动效，画面是我们自己画的墨线插画。
// 满屏一个世界、中间一扇门；顶栏是一条描边胶囊，中间凹下去放品牌；左侧菱形计数；门下黑色按钮「推开这扇门」，
// 点开从左侧滑出账号面板（Thorgal 的菜单面板）。滚轮一格 / 滑动 50px / 方向键 / 菱形换门，新世界从分形噪点里把旧世界吃掉，阈值处一道金线；
// 标题逐字从下方升起。左下角的五根小竖条是「自动换门」开关。减少动态效果：不自动换门，换门只做淡入淡出，标题不动。

export type Door = { id: string; name: string; sub: string; src: string };

export const DOORS: Door[] = [
  { id: 'desert', name: '荒原', sub: '浮石之地，没有名字的旅途', src: '/auth/door-01-desert.jpg' },
  { id: 'harbor', name: '雾港', sub: '夜雾里靠岸的船，带来一封信', src: '/auth/door-02-harbor.jpg' },
  { id: 'forest', name: '林海', sub: '萤火引路，林深不知处', src: '/auth/door-03-forest.jpg' },
  { id: 'city', name: '故城', sub: '灯笼还亮着，城门没有关', src: '/auth/door-04-city.jpg' },
  { id: 'snow', name: '雪境', sub: '雪落无声，门后有人在等', src: '/auth/door-05-snow.jpg' },
];

const DUR = 2400;  // 噪点吃掉旧画面（Thorgal：2.4s easeInOut）
const SWAP = 1000; // 标题在 1000ms 换成新的
const EDGE = 0.08;
const AUTO = 8000;
const GOLD = [214, 190, 140];

const ease = (t: number) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function noiseField(w: number, h: number, seed: number): Float32Array {
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x: number, y: number) => {
    const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf); const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const out = new Float32Array(w * h);
  let lo = Infinity; let hi = -Infinity;
  const aspect = w / h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i / w) * 2.5 * aspect; const y = (j / h) * 2.5;
    let n = 0; let amp = .5; let f = 1;
    for (let o = 0; o < 4; o++) { n += amp * vnoise(x * f, y * f); f *= 2; amp *= .5; }
    out[j * w + i] = n; if (n < lo) lo = n; if (n > hi) hi = n;
  }
  for (let k = 0; k < out.length; k++) out[k] = (out[k] - lo) / (hi - lo || 1);
  return out;
}

// 满屏铺图（cover，门保持在正中），上下轻压暗保证顶栏和底部文字可读
function drawScene(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, W, H);
  if (img.naturalWidth) {
    const ir = img.naturalWidth / img.naturalHeight; const r = W / H;
    let dw = W; let dh = W / ir;
    if (dh < H) { dh = H; dw = H * ir; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    void r;
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(26,26,26,.42)'); g.addColorStop(.18, 'rgba(26,26,26,0)');
  g.addColorStop(.72, 'rgba(26,26,26,0)'); g.addColorStop(1, 'rgba(26,26,26,.5)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const c = ctx.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .4);
  c.addColorStop(0, 'rgba(26,26,26,.28)'); c.addColorStop(1, 'rgba(26,26,26,0)');
  ctx.fillStyle = c; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function Letters({ text }: { text: string }) {
  return (
    <>
      {Array.from(tr(text)).map((ch, i) => (
        <span className="p-door-ch" key={i} style={{ ['--c' as string]: i }}><span>{ch === ' ' ? '\u00a0' : ch}</span></span>
      ))}
    </>
  );
}

// 顶栏描边：一整条圆角胶囊，中间顶边凹下去一个梯形放品牌（按实际宽度画，角不变形）
function Lintel() {
  const ref = useRef<SVGSVGElement>(null);
  const [d, setD] = useState('');
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const draw = () => {
      const w = el.clientWidth; const h = el.clientHeight; if (!w || !h) return;
      const r = 12; const t = .5; const b = h - .5; const cx = w / 2;
      const half = Math.min(120, w * .18); const slope = Math.min(26, h * .55); const dip = h * .0;
      void dip;
      // 从左上开始顺时针：顶边到凹口 → 斜下 → 平 → 斜上 → 顶边 → 右上圆角 → 右边 → 底边 → 左边
      setD([
        `M ${r + .5} ${t}`, `H ${cx - half - slope}`, `L ${cx - half} ${b}`, `M ${cx + half} ${b}`, `L ${cx + half + slope} ${t}`,
        `H ${w - r - .5}`, `A ${r} ${r} 0 0 1 ${w - .5} ${t + r}`, `V ${b - r}`, `A ${r} ${r} 0 0 1 ${w - r - .5} ${b}`,
        `H ${cx + half}`, `M ${cx - half} ${b}`, `H ${r + .5}`, `A ${r} ${r} 0 0 1 .5 ${b - r}`, `V ${t + r}`, `A ${r} ${r} 0 0 1 ${r + .5} ${t}`,
      ].join(' '));
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <svg ref={ref} className="p-door-lintel" aria-hidden="true"><path d={d} /></svg>;
}

export function AuthDoors({ mode, initialOpen, footer, children }: { mode: 'login' | 'register' | 'other'; initialOpen: boolean; footer: ReactNode; children: ReactNode }) {
  const doors = DOORS;
  const n = doors.length;
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out' | 'pre'>('in');
  const [motion, setMotion] = useState(false);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(initialOpen);
  const [auto, setAuto] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const imgs = useRef<HTMLImageElement[]>([]);
  const st = useRef({ cur: 0, busy: false, W: 0, H: 0, noise: null as Float32Array | null, gw: 0, gh: 0, seed: 1, raf: 0 });
  const bufs = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement; t: HTMLCanvasElement; mask: HTMLCanvasElement; gold: HTMLCanvasElement } | null>(null);
  const lastTurn = useRef(0);
  const openRef = useRef(open);
  openRef.current = open;

  const pad = (v: number) => String(v).padStart(2, '0');

  useEffect(() => { setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);

  const layout = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(1, Math.round(r.width * dpr)); const H = Math.max(1, Math.round(r.height * dpr));
    const s = st.current; s.W = W; s.H = H;
    c.width = W; c.height = H;
    if (!bufs.current) bufs.current = { a: document.createElement('canvas'), b: document.createElement('canvas'), t: document.createElement('canvas'), mask: document.createElement('canvas'), gold: document.createElement('canvas') };
    const B = bufs.current;
    B.a.width = B.b.width = B.t.width = W; B.a.height = B.b.height = B.t.height = H;
    s.gw = 400; s.gh = Math.max(80, Math.round(400 * H / W));
    B.mask.width = B.gold.width = s.gw; B.mask.height = B.gold.height = s.gh;
    s.noise = noiseField(s.gw, s.gh, s.seed);
    const img = imgs.current[s.cur];
    if (img) { drawScene(B.a.getContext('2d')!, img, W, H); c.getContext('2d')!.drawImage(B.a, 0, 0); }
  }, []);

  useEffect(() => {
    let alive = true;
    imgs.current = doors.map((d) => { const im = new Image(); im.decoding = 'async'; im.src = d.src; return im; });
    const first = imgs.current[0];
    const go = () => { if (!alive) return; layout(); lastTurn.current = Date.now(); setReady(true); };
    if (first.complete && first.naturalWidth) go(); else { first.onload = go; first.onerror = go; }
    const ro = new ResizeObserver(() => { if (!st.current.busy) layout(); });
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => { alive = false; ro.disconnect(); cancelAnimationFrame(st.current.raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const turn = useCallback((to: number) => {
    const s = st.current;
    if (s.busy) return;
    const next = ((to % n) + n) % n;
    if (next === s.cur) return;
    const c = canvasRef.current; const B = bufs.current; const img = imgs.current[next];
    if (!c || !B || !img) return;
    lastTurn.current = Date.now();
    setActive(next);
    if (motion) {
      setPhase('out');
      window.setTimeout(() => { setShown(next); setPhase('pre'); requestAnimationFrame(() => requestAnimationFrame(() => setPhase('in'))); }, SWAP);
    } else setShown(next);
    const finish = () => {
      const a = B.a; B.a = B.b; B.b = a;
      c.getContext('2d')!.drawImage(B.a, 0, 0);
      s.cur = next; s.busy = false;
    };
    const draw = () => {
      drawScene(B.b.getContext('2d')!, img, s.W, s.H);
      const ctx = c.getContext('2d')!;
      s.busy = true;
      const t0 = performance.now();
      if (!motion) {
        const fade = (now: number) => {
          const p = Math.min(1, (now - t0) / 400);
          ctx.globalAlpha = 1; ctx.drawImage(B.a, 0, 0); ctx.globalAlpha = p; ctx.drawImage(B.b, 0, 0); ctx.globalAlpha = 1;
          if (p < 1) s.raf = requestAnimationFrame(fade); else finish();
        };
        s.raf = requestAnimationFrame(fade);
        return;
      }
      s.seed += 1; s.noise = noiseField(s.gw, s.gh, s.seed);
      const noise = s.noise; const { gw, gh } = s;
      const mctx = B.mask.getContext('2d')!; const gctx = B.gold.getContext('2d')!; const tc = B.t.getContext('2d')!;
      const md = mctx.createImageData(gw, gh); const gd = gctx.createImageData(gw, gh);
      const frame = (now: number) => {
        const p = ease(Math.min(1, (now - t0) / DUR));
        const th = p * (1 + EDGE * 2) - EDGE;
        for (let k = 0; k < noise.length; k++) {
          const v = noise[k];
          md.data[k * 4] = md.data[k * 4 + 1] = md.data[k * 4 + 2] = 255;
          md.data[k * 4 + 3] = (1 - smooth(th - EDGE, th + EDGE, v)) * 255;
          const g = p > 0 && p < 1 ? Math.pow(Math.max(0, 1 - Math.abs(v - th) / (EDGE * .1)), 2) : 0;
          gd.data[k * 4] = GOLD[0]; gd.data[k * 4 + 1] = GOLD[1]; gd.data[k * 4 + 2] = GOLD[2]; gd.data[k * 4 + 3] = g * 150;
        }
        mctx.putImageData(md, 0, 0); gctx.putImageData(gd, 0, 0);
        tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, s.W, s.H); tc.drawImage(B.b, 0, 0);
        tc.globalCompositeOperation = 'destination-in'; tc.imageSmoothingEnabled = true; tc.drawImage(B.mask, 0, 0, s.W, s.H);
        ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(B.a, 0, 0); ctx.drawImage(B.t, 0, 0);
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(B.gold, 0, 0, s.W, s.H);
        ctx.globalCompositeOperation = 'source-over';
        if (p < 1) s.raf = requestAnimationFrame(frame); else finish();
      };
      s.raf = requestAnimationFrame(frame);
    };
    if (img.complete && img.naturalWidth) draw(); else { img.onload = draw; img.onerror = draw; }
  }, [motion, n]);

  // 自动换门（面板打开时、页面隐藏时、开关关掉时都停）
  useEffect(() => {
    if (!motion || !ready || !auto) return;
    const t = window.setInterval(() => {
      if (openRef.current || document.hidden || Date.now() - lastTurn.current < AUTO) return;
      turn(st.current.cur + 1);
    }, 500);
    return () => window.clearInterval(t);
  }, [motion, ready, auto, turn]);

  // 滚轮 / 滑动 / 方向键（面板打开时不换门）
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (openRef.current || Math.abs(e.deltaY) <= 10) return;
      if (Date.now() - lastTurn.current < DUR * .75) return;
      turn(st.current.cur + (e.deltaY > 0 ? 1 : -1));
    };
    let x0 = 0; let y0 = 0;
    const onStart = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
    const onEnd = (e: TouchEvent) => {
      if (openRef.current) return;
      const dx = e.changedTouches[0].clientX - x0; const dy = e.changedTouches[0].clientY - y0;
      const d = Math.abs(dy) > Math.abs(dx) ? dy : dx;
      if (Math.abs(d) > 50) turn(st.current.cur + (d < 0 ? 1 : -1));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) { setOpen(false); ctaRef.current?.focus(); return; }
      if (openRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable], .ui-select')) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); turn(st.current.cur + 1); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); turn(st.current.cur - 1); }
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd); window.removeEventListener('keydown', onKey); };
  }, [turn]);

  // 面板打开后把焦点放进第一个输入框
  useEffect(() => {
    if (!open || !ready) return;
    const t = window.setTimeout(() => { (panelRef.current?.querySelector('input:not([type=hidden]), [tabindex="0"]') as HTMLElement | null)?.focus({ preventScroll: true }); }, 450);
    return () => window.clearTimeout(t);
  }, [open, ready]);

  const onMove = (e: React.MouseEvent) => {
    if (!motion) return;
    const el = rootRef.current; if (!el) return;
    el.style.setProperty('--mx', ((e.clientX / window.innerWidth) - .5).toFixed(3));
    el.style.setProperty('--my', ((e.clientY / window.innerHeight) - .5).toFixed(3));
  };

  const cur = doors[shown];
  const ctaLabel = mode === 'login' ? '推开这扇门 · 登录' : mode === 'register' ? '推开这扇门 · 注册' : '推开这扇门';

  return (
    <div className="p-door" ref={rootRef} onMouseMove={onMove} data-ready={ready ? '' : undefined} data-open={open ? '' : undefined} data-motion={motion ? '' : undefined}>
      <div className="p-door-scene" aria-hidden="true">
        <img className="p-door-poster" src={doors[0].src} alt="" />
        <canvas ref={canvasRef} />
      </div>

      <header className="p-door-head">
        <Lintel />
        <div className="p-door-head-l">
          <button type="button" className="p-door-menu" aria-expanded={open} aria-controls="p-door-panel" onClick={() => setOpen((v) => !v)}>
            <svg viewBox="0 0 22 14" aria-hidden="true"><path d="M0 1h22M0 7h22M0 13h22" /></svg>
            <span>{open ? '关闭' : '账号'}</span>
          </button>
        </div>
        <Link className="p-door-logo" href="/" aria-label="夜话首页">
          <span className="p-door-logo-zh">夜话</span>
          <span className="p-door-logo-en">YEHUA</span>
        </Link>
        <div className="p-door-head-r">
          {mode === 'login'
            ? <Link href="/login?mode=register" className="p-door-news"><i aria-hidden="true" />注册</Link>
            : <Link href="/login?mode=login" className="p-door-news"><i aria-hidden="true" />登录</Link>}
        </div>
      </header>

      <nav className="p-door-nav" aria-label="切换世界">
        {doors.map((d, i) => (
          <button key={d.id} type="button" aria-label={`第 ${i + 1} 扇门：${d.name}`} aria-current={i === active ? 'true' : undefined} onClick={() => turn(i)}>
            <i aria-hidden="true" />
            {i === active && <span key={`n${active}`}><Letters text={d.name} /></span>}
          </button>
        ))}
      </nav>

      <div className="p-door-center">
        <div className="p-door-title" data-phase={phase}>
          <span className="p-door-badge" key={`b${shown}`}>门 {pad(shown + 1)}</span>
          <p className="p-door-name" aria-live="polite"><Letters text={cur.name} /></p>
          <p className="p-door-sub" key={`s${shown}`}>{cur.sub}</p>
        </div>
        <button type="button" ref={ctaRef} className="p-door-cta" aria-expanded={open} aria-controls="p-door-panel" onClick={() => setOpen(true)}>
          <svg className="p-door-orn p-door-orn--l" viewBox="0 0 16 30" aria-hidden="true"><path d="M8 0v30M8 15l-6 0M8 9l5 6-5 6" /></svg>
          <span className="p-door-cta-label"><span>{ctaLabel}</span></span>
          <svg className="p-door-orn p-door-orn--r" viewBox="0 0 16 30" aria-hidden="true"><path d="M8 0v30M8 15l6 0M8 9l-5 6 5 6" /></svg>
        </button>
      </div>

      <div className="p-door-scroll" aria-hidden="true">
        <span><Letters text="滚动探索" /></span>
        <i />
      </div>

      <button type="button" className="p-door-sound" aria-pressed={auto} aria-label={auto ? '暂停自动换门' : '开启自动换门'} onClick={() => { setAuto((v) => !v); lastTurn.current = Date.now(); }}>
        <i /><i /><i /><i /><i />
      </button>
      <div className="p-door-legal">{footer}</div>

      <div className="p-door-veil" aria-hidden="true" onClick={() => setOpen(false)} />
      <aside id="p-door-panel" ref={panelRef} className="p-door-panel-side" role="dialog" aria-modal={open} aria-label="账号" aria-hidden={!open} inert={!open}>
        <div className="p-door-panel-top">
          <span className="p-door-panel-no">门 {pad(active + 1)} · {doors[active].name}</span>
          <button type="button" className="p-door-close" onClick={() => { setOpen(false); ctaRef.current?.focus(); }}>
            <svg viewBox="0 0 14 14" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" /></svg>关闭
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
