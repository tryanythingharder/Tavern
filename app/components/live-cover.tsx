'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

// 主题侧栏里的角色立绘位（folio 卷首图、nocturne 档案照、stage 角色卡）：
// 有表情立绘时跟着最后一条角色回复换表情（ChatSpriteFloat 负责判断并发布），没有就显示封面。
let current: { src: string; label: string } | null = null;
const listeners = new Set<() => void>();

export function publishLiveSprite(next: { src: string; label: string } | null) {
  if (current?.src === next?.src && current?.label === next?.label) return;
  current = next;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => current;
const server = () => null;

export function useLiveSprite() {
  return useSyncExternalStore(subscribe, snapshot, server);
}

// 没有封面时传 fallback（首字占位）：有表情立绘就显示立绘，否则显示占位
export function LiveCover({ src, className, draggable, fallback = null }: { src: string | null; className?: string; draggable?: boolean; fallback?: ReactNode }) {
  const sprite = useLiveSprite();
  if (!sprite) return src ? <img src={src} alt="" className={className} draggable={draggable} /> : <>{fallback}</>;
  return <img key={sprite.src} src={sprite.src} alt="" title={sprite.label} className={`${className ?? ''} is-live-sprite`.trim()} draggable={draggable} />;
}
