import { cookies } from 'next/headers';

// 屏蔽的作者：存 cookie，服务端列表与客户端广场共用同一份
const COOKIE = 'tavern_blocked_authors';

export async function getBlockedAuthors(): Promise<string[]> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return [];
  try {
    const list = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string').slice(0, 200) : [];
  } catch {
    return [];
  }
}

export async function setBlockedAuthors(list: string[]): Promise<string[]> {
  const store = await cookies();
  const next = [...new Set(list.filter(Boolean))].slice(0, 200);
  store.set(COOKIE, encodeURIComponent(JSON.stringify(next)), { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return next;
}
