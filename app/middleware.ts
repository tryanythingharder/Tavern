import { NextResponse, type NextRequest } from 'next/server';

const LANG_COOKIE = 'tavern_lang';
const YEAR = 365 * 24 * 3600;

// 首次访问按浏览器语言选界面语言（中文浏览器用中文，其余用英文），之后以 cookie 为准；
// 任何页面带 ?lang=en / ?lang=zh 可直接切换。
function pickLang(request: NextRequest): { lang: 'zh' | 'en'; set: boolean } {
  const q = request.nextUrl.searchParams.get('lang');
  if (q === 'en' || q === 'zh') return { lang: q, set: true };
  const saved = request.cookies.get(LANG_COOKIE)?.value;
  if (saved === 'en' || saved === 'zh') return { lang: saved, set: false };
  const accept = (request.headers.get('accept-language') ?? '').toLowerCase();
  const first = accept.split(',')[0]?.trim() ?? '';
  return { lang: first.startsWith('zh') || !accept ? 'zh' : 'en', set: true };
}

// 邀请链接：任何页面带 ?ref=R-XXXXXX 都记进 cookie（30 天），朋友先逛几页再注册也不会丢码。
// 注册页从 cookie 预填邀请码；注册成功后清掉。
export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  const validRef = ref && /^R-[A-Z0-9]{6}$/i.test(ref) ? ref.toUpperCase() : null;
  const { lang, set } = pickLang(request);
  if (!validRef && !set) return NextResponse.next();
  let response: NextResponse;
  if (set) {
    // 让这一次渲染就用上新语言
    request.cookies.set(LANG_COOKIE, lang);
    const headers = new Headers(request.headers);
    headers.set('cookie', request.cookies.toString());
    response = NextResponse.next({ request: { headers } });
    response.cookies.set(LANG_COOKIE, lang, { maxAge: YEAR, sameSite: 'lax', path: '/' });
  } else response = NextResponse.next();
  if (validRef) response.cookies.set('tavern_ref', validRef, { maxAge: 30 * 24 * 3600, sameSite: 'lax', path: '/', httpOnly: true });
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|icons|sw.js|manifest.webmanifest|favicon.ico|i18n-en.js).*)'],
};
