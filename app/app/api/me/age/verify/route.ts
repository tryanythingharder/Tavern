import { fail, json, requireUser } from '@/lib/api';
import { activeProvider } from '@/lib/age-verify';

export const dynamic = 'force-dynamic';

// POST /api/me/age/verify —— 发起第三方年龄验证，返回跳转地址
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const provider = activeProvider();
  if (!provider) return fail('站点还没有接入年龄验证服务，请联系管理员', 503);
  const origin = new URL(request.url).origin;
  const siteUrl = (process.env.TAVERN_SITE_URL || origin).replace(/\/$/, '');
  try {
    const url = await provider.start(user.id, { siteUrl, returnUrl: `${siteUrl}/me#age` });
    return json({ url });
  } catch (error) {
    return fail(`发起验证失败：${(error as Error).message}`, 502);
  }
}
