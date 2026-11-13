import { endSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /logout —— 退出并回到登录页（顶栏「切换账号」用它，避免 /login 把已登录用户弹回首页）
export async function GET(request: Request) {
  await endSession();
  return Response.redirect(new URL('/login', request.url), 303);
}
