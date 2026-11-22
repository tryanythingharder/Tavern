import fs from 'node:fs';
import path from 'node:path';
import type { Theme } from '@/lib/theme';

// 按主题拆分的全局样式（scripts/build-css.mjs 生成 public/_css/manifest.json）。
// 生产缓存清单；开发每次读，方便 css:watch 重建后直接刷新。
type Manifest = Record<string, string>;
let cached: Manifest | null = null;

function manifest(): Manifest {
  if (cached && process.env.NODE_ENV === 'production') return cached;
  try {
    cached = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/_css/manifest.json'), 'utf8')) as Manifest;
  } catch {
    console.error('[css-assets] public/_css/manifest.json 不存在，先运行 node scripts/build-css.mjs');
    cached = {};
  }
  return cached;
}

export function themeCssHref(theme: Theme): string | undefined {
  return manifest()[`theme-${theme}`];
}
export function postCssHref(): string | undefined {
  return manifest().post;
}
/** 切换主题时客户端预加载用：{ folio: '/_css/theme-folio.xxx.css', ... } */
export function themeCssMap(): Record<string, string> {
  const m = manifest();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (k.startsWith('theme-')) out[k.slice(6)] = v;
  return out;
}

/** 页面级样式包（page-auth、page-chat），见 scripts/build-css.mjs */
export function pageCssHref(name: 'auth' | 'chat'): string | undefined {
  return manifest()[`page-${name}`];
}
