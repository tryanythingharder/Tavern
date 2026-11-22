// 生成扣点后广播最新余额：顶栏钱包、对话页余额小标都订阅它
export type PointsEvent = { balance: number; cost: number; free?: number };
export const POINTS_EVENT = 'tavern:points';

export function emitPoints(event: { balance?: unknown; cost?: unknown; free?: unknown }) {
  if (typeof window === 'undefined' || typeof event.balance !== 'number') return;
  const detail: PointsEvent = { balance: event.balance, cost: typeof event.cost === 'number' ? event.cost : 0, free: typeof event.free === 'number' ? event.free : undefined };
  window.dispatchEvent(new CustomEvent<PointsEvent>(POINTS_EVENT, { detail }));
}

export function onPoints(handler: (event: PointsEvent) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<PointsEvent>).detail);
  window.addEventListener(POINTS_EVENT, listener);
  return () => window.removeEventListener(POINTS_EVENT, listener);
}
