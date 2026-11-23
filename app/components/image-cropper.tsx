'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/settings-ui';

/**
 * 站内图片编辑器：拖动定位、滚轮/滑杆缩放、90° 旋转、水平翻转、亮度/对比度/饱和度。
 * 预览用 canvas 实时画；导出时按同一套变换画到目标尺寸（头像 512²，背景 1500×500）。
 */
export type CropShape = 'circle' | 'banner';

type Props = {
  file: File;
  shape: CropShape;
  title: string;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
};

const OUTPUT = { circle: { w: 512, h: 512 }, banner: { w: 1500, h: 500 } } as const;
const FILTERS = [
  { key: 'brightness', label: '亮度' },
  { key: 'contrast', label: '对比度' },
  { key: 'saturate', label: '饱和度' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

export function ImageCropper({ file, shape, title, busy = false, error = '', onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Modal 走 portal、首帧不挂载，用 state 当 ref，挂上后再测量
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState({ w: 320, h: shape === 'circle' ? 320 : 107 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [filters, setFilters] = useState<Record<FilterKey, number>>({ brightness: 100, contrast: 100, saturate: 100 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { if (alive) { setLoadError(''); setImg(image); } };
    image.onerror = () => { if (alive) setLoadError('这张图片打不开，换一张试试'); };
    image.src = url;
    // 开发模式下 effect 会跑两次：旧图片在 URL 被回收后会触发 onerror，用 alive 忽略
    return () => { alive = false; image.onload = null; image.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  // 预览区随弹窗宽度自适应
  useEffect(() => {
    if (!stage) return;
    const measure = () => {
      const width = Math.min(stage.clientWidth, shape === 'circle' ? 340 : 560);
      setView({ w: width, h: shape === 'circle' ? width : Math.round(width / 3) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [shape, stage]);

  const rotated = rotation % 180 !== 0;
  const geometry = useCallback((vw: number, vh: number) => {
    if (!img) return null;
    const rw = rotated ? img.naturalHeight : img.naturalWidth;
    const rh = rotated ? img.naturalWidth : img.naturalHeight;
    const scale = Math.max(vw / rw, vh / rh) * zoom;
    return { rw, rh, scale, maxX: Math.max(0, (rw * scale - vw) / 2), maxY: Math.max(0, (rh * scale - vh) / 2) };
  }, [img, rotated, zoom]);

  // 缩放/旋转后把偏移收回到「图片盖满取景框」的范围内
  const clamp = useCallback((x: number, y: number) => {
    const g = geometry(view.w, view.h);
    if (!g) return { x: 0, y: 0 };
    return { x: Math.max(-g.maxX, Math.min(g.maxX, x)), y: Math.max(-g.maxY, Math.min(g.maxY, y)) };
  }, [geometry, view]);

  useEffect(() => { setOffset((value) => clamp(value.x, value.y)); }, [clamp]);

  const filterString = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%)`;

  const paint = useCallback((ctx: CanvasRenderingContext2D, vw: number, vh: number, factor: number) => {
    const g = geometry(vw / factor, vh / factor);
    if (!img || !g) return;
    ctx.save();
    ctx.clearRect(0, 0, vw, vh);
    ctx.filter = filterString;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(vw / 2 + offset.x * factor, vh / 2 + offset.y * factor);
    ctx.rotate((rotation * Math.PI) / 180);
    const s = g.scale * factor;
    ctx.scale(flip ? -s : s, s);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.restore();
  }, [geometry, img, offset, rotation, flip, filterString]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) paint(ctx, canvas.width, canvas.height, dpr);
  }, [paint, view]);

  const onPointerDown = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    setOffset(clamp(d.ox + event.clientX - d.x, d.oy + event.clientY - d.y));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (event: React.WheelEvent) => {
    setZoom((value) => Math.max(1, Math.min(4, value * (event.deltaY < 0 ? 1.08 : 1 / 1.08))));
  };
  const onKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 20 : 6;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset((value) => clamp(value.x + move[0], value.y + move[1]));
  };

  const reset = () => {
    setZoom(1); setRotation(0); setFlip(false); setOffset({ x: 0, y: 0 });
    setFilters({ brightness: 100, contrast: 100, saturate: 100 });
  };

  const exportImage = () => {
    const out = OUTPUT[shape];
    const canvas = document.createElement('canvas');
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    paint(ctx, out.w, out.h, out.w / view.w);
    // 优先 WebP（体积小）；不支持的浏览器 toBlob 会退回 PNG，服务端按文件头识别
    canvas.toBlob((blob) => { if (blob) onDone(blob); }, 'image/webp', 0.9);
  };

  const pct = (value: number) => `${Math.round(value)}%`;

  return (
    <Modal
      title={title}
      onClose={() => { if (!busy) onCancel(); }}
      footer={
        <>
          <button className="p-btn p-btn--sm p-crop-reset" type="button" disabled={busy || !img} onClick={reset}>重置</button>
          <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={onCancel}>取消</button>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy || !img} onClick={exportImage}>{busy ? '上传中…' : '保存'}</button>
        </>
      }
    >
      <div className={`p-crop p-crop--${shape}`}>
        {(loadError || error) && <p className="p-form-error" role="alert">{loadError || error}</p>}
        <div className="p-crop-stage" ref={setStage}>
          <div
            className="p-crop-frame"
            style={{ width: view.w, height: view.h }}
            role="application"
            aria-label="拖动调整位置，滚轮或方向键微调"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKey}
          >
            <canvas ref={canvasRef} style={{ width: view.w, height: view.h }} />
            <span className="p-crop-mask" aria-hidden="true" />
            <span className="p-crop-grid" aria-hidden="true" />
            {!img && !loadError && <span className="p-crop-loading">正在读取图片…</span>}
          </div>
          {shape === 'circle' && img && (
            <div className="p-crop-previews" aria-hidden="true">
              {[64, 40, 28].map((size) => (
                <PreviewDot key={size} size={size} source={canvasRef.current} version={`${zoom}-${rotation}-${flip}-${offset.x}-${offset.y}-${filterString}-${view.w}`} />
              ))}
            </div>
          )}
        </div>
        <p className="p-crop-tip">拖动图片调整位置，滚轮或滑杆缩放。{shape === 'circle' ? '圆圈里的部分就是头像。' : '会显示在你的作者主页顶部，比例 3:1。'}</p>

        <div className="p-crop-tools">
          <div className="p-crop-row">
            <span className="p-crop-label">缩放</span>
            <input className="p-crop-range" type="range" min={1} max={4} step={0.01} value={zoom} aria-label="缩放" onChange={(event) => setZoom(Number(event.target.value))} />
            <span className="p-crop-val">{zoom.toFixed(2)}×</span>
          </div>
          <div className="p-crop-buttons">
            <button className="p-btn p-btn--sm" type="button" onClick={() => setRotation((value) => (value + 270) % 360)} aria-label="向左旋转 90 度">
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 1 1 1.5 7.5M4 4v5h5" /></svg>左转
            </button>
            <button className="p-btn p-btn--sm" type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="向右旋转 90 度">
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 9a8 8 0 1 0-1.5 7.5M20 4v5h-5" /></svg>右转
            </button>
            <button className="p-btn p-btn--sm" type="button" aria-pressed={flip} onClick={() => setFlip((value) => !value)}>
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z" /></svg>翻转
            </button>
          </div>
          <details className="p-crop-adjust">
            <summary>调色</summary>
            {FILTERS.map((item) => (
              <div className="p-crop-row" key={item.key}>
                <span className="p-crop-label">{item.label}</span>
                <input className="p-crop-range" type="range" min={50} max={150} step={1} value={filters[item.key]} aria-label={item.label} onChange={(event) => setFilters((value) => ({ ...value, [item.key]: Number(event.target.value) }))} />
                <span className="p-crop-val">{pct(filters[item.key])}</span>
              </div>
            ))}
          </details>
        </div>
      </div>
    </Modal>
  );
}

// 小尺寸圆形预览：从主画布缩绘（version 变化时重画）
function PreviewDot({ size, source, version }: { size: number; source: HTMLCanvasElement | null; version: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source) return;
    const id = requestAnimationFrame(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    });
    return () => cancelAnimationFrame(id);
  }, [size, source, version]);
  return <canvas ref={ref} className="p-crop-dot" style={{ width: size, height: size }} />;
}
