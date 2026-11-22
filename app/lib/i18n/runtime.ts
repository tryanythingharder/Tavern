import { translate, type Dict, type Locale, LOCALE_COOKIE } from './core';

declare global {
  // eslint-disable-next-line no-var
  var __TAVERN_I18N_EN: Dict | undefined;
  interface Window { __TAVERN_LANG?: Locale; __TAVERN_I18N?: Dict }
}

let nodeRequire: ((id: string) => any) | null = null;
let asyncStorageMod: unknown = null;

function serverLocale(): Locale {
  try {
    // 读 Next 的请求上下文拿 cookie（同步）；静态预渲染时没有请求，回落中文
    // 模块对象只 require 一次：每次 require 都会走一遍路径解析（stat），长页面上千次调用会拖慢 1 秒以上
    if (!asyncStorageMod) {
      if (!nodeRequire) nodeRequire = eval('require');
      asyncStorageMod = nodeRequire!('next/dist/server/app-render/work-unit-async-storage.external.js');
    }
    const mod = asyncStorageMod as { workUnitAsyncStorage?: { getStore?: () => any } };
    const store = mod.workUnitAsyncStorage?.getStore?.();
    const value = store?.cookies?.get?.(LOCALE_COOKIE)?.value;
    return value === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}

export function currentLocale(): Locale {
  if (typeof window === 'undefined') return serverLocale();
  return window.__TAVERN_LANG === 'en' ? 'en' : 'zh';
}

function currentDict(): Dict | null {
  if (currentLocale() !== 'en') return null;
  if (typeof window === 'undefined') return globalThis.__TAVERN_I18N_EN ?? null;
  return window.__TAVERN_I18N ?? null;
}

/** 非 JSX 场景的翻译（alert/confirm/document.title/元数据/服务端文案） */
export function tr(text: string, vars?: Record<string, string | number>): string {
  let out = translate(text, currentDict());
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

export function trNode(text: string): string {
  return translate(text, currentDict());
}

export function activeDict(): Dict | null { return currentDict(); }

/** 页面元数据（标题、描述）按当前语言翻译 */
export function trMeta<T extends Record<string, any>>(meta: T): T {
  const walk = (v: any): any => {
    if (typeof v === 'string') return tr(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !(v instanceof URL)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'url' || k === 'images' ? x : walk(x)]));
    return v;
  };
  return walk(meta);
}

/** 列表拼接：中文用「、」「；」「，」，英文统一换成半角逗号/分号 */
export function joinList(items: readonly string[], sep: '、' | '；' | '，' = '、'): string {
  if (currentLocale() !== 'en') return items.join(sep);
  return items.join(sep === '；' ? '; ' : ', ');
}
