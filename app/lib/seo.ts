import type { Metadata } from 'next';
import { currentLocale } from '@/lib/i18n/runtime';

// 搜索引擎与分享卡片。站点根地址取 NEXT_PUBLIC_SITE_URL（上线时必须配成正式域名）。
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100').replace(/\/+$/, '');
}

export function ogImage(): string {
  return currentLocale() === 'en' ? '/og-en.jpg' : '/og.jpg';
}

// 同一地址按 cookie 出中/英文；?lang= 可强制切换，给搜索引擎两条带语言的入口
export function alternates(path: string): Metadata['alternates'] {
  return {
    canonical: path,
    languages: { 'zh-CN': `${path}?lang=zh`, en: `${path}?lang=en`, 'x-default': path },
  };
}

// 私人/功能页面：不收录，也不跟链接
export const NOINDEX: Metadata['robots'] = { index: false, follow: false };
