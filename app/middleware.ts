import { NextResponse, type NextRequest } from 'next/server';

// 邀请链接：任何页面带 ?ref=R-XXXXXX 都记进 cookie（30 天），朋友先逛几页再注册也不会丢码。
// 注册页从 cookie 预填邀请码；注册成功后清掉。
export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get('ref');
  if (!ref || !/^R-[A-Z0-9]{6}$/i.test(ref)) return NextResponse.next();
  const response = NextResponse.next();
  response.cookies.set('tavern_ref', ref.toUpperCase(), { maxAge: 30 * 24 * 3600, sameSite: 'lax', path: '/', httpOnly: true });
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|icons|sw.js|manifest.webmanifest|favicon.ico).*)'],
};
