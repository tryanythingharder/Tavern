'use client';

import { useSyncExternalStore } from 'react';
import { currentLocale } from '@/lib/i18n/runtime';

// 时间按「看的人」的时区和语言显示。服务端不知道浏览器时区，直接格式化会和客户端对不上（水合报错）。
// 做法：水合那一帧用 UTC 渲染（服务端和客户端结果一致），挂载后马上换成本地时区。
export type TimeStyle = 'datetime' | 'date' | 'md' | 'mdhm' | 'time';

const OPTIONS: Record<TimeStyle, Intl.DateTimeFormatOptions> = {
  datetime: { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  date: { year: 'numeric', month: 'numeric', day: 'numeric' },
  md: { month: 'numeric', day: 'numeric' },
  mdhm: { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
  time: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
};

export function formatTime(value: number | string | Date, style: TimeStyle = 'datetime', timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(currentLocale() === 'en' ? 'en-US' : 'zh-CN', { ...OPTIONS[style], ...(timeZone ? { timeZone } : {}) });
}

const noop = () => () => {};
/** 水合完成前为 false，之后为 true */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function LocalTime({ value, style = 'datetime', render, className }: {
  value: number | string | Date;
  style?: TimeStyle;
  /** 挂载后用它生成文案（如「3 分钟前」）；水合帧仍显示 UTC 的 style 格式 */
  render?: (value: number) => string;
  className?: string;
}) {
  const mounted = useMounted();
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const text = !mounted ? formatTime(ms, style, 'UTC') : render ? render(ms) : formatTime(ms, style);
  return <time className={className} dateTime={Number.isNaN(ms) ? undefined : new Date(ms).toISOString()}>{text}</time>;
}
