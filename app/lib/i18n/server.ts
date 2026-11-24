import { cookies } from 'next/headers';
import en from './en.json';
import { LOCALE_COOKIE, type Locale } from './core';

globalThis.__TAVERN_I18N_EN = en as Record<string, string>;

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return store.get(LOCALE_COOKIE)?.value === 'en' ? 'en' : 'zh';
}

import { createHash } from 'node:crypto';
let version: string | null = null;
/** 词典版本号，用作脚本地址参数，内容变了缓存自动失效 */
export function dictVersion() {
  if (!version) version = createHash('sha1').update(JSON.stringify(en)).digest('hex').slice(0, 10);
  return version;
}
