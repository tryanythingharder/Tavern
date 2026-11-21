import { NextResponse, type NextRequest } from 'next/server';
import { referrerFor } from '@/lib/growth';

// 专属邀请链接 /i/R-XXXXXX：记下邀请人（30 天），跳到注册页；注册页上邀请码锁定不可改
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code || '').trim().toUpperCase();
  const valid = referrerFor(code) ? code : null;
  const url = new URL(valid ? `/login?ref=${valid}` : '/login', request.url);
  const response = NextResponse.redirect(url, 302);
  if (valid) response.cookies.set('tavern_ref', valid, { maxAge: 30 * 24 * 3600, sameSite: 'lax', path: '/', httpOnly: true });
  return response;
}
