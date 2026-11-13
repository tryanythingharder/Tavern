import { fail, json, requireUser } from '@/lib/api';
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor, getPasswordHash, isTwoFactorEnabled, twoFactorStatus, verifyPassword, verifyTwoFactor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/me/2fa —— 当前两步验证状态（不返回密钥）
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json(twoFactorStatus(user.id));
}

// POST /api/me/2fa —— { action: 'setup' | 'enable' | 'disable', code?, password? }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { action?: string; code?: string; password?: string };

  if (body.action === 'setup') {
    if (isTwoFactorEnabled(user.id)) return fail('两步验证已经开启', 400);
    const setup = beginTwoFactorSetup(user.id);
    // 密钥与恢复码只在这里返回一次；前端必须让用户保存后再输入验证码确认
    return json({ ok: true, ...setup });
  }

  if (body.action === 'enable') {
    if (!enableTwoFactor(user.id, String(body.code ?? ''))) return fail('验证码不对，请检查设备时间后重试', 400);
    return json({ ok: true, enabled: true });
  }

  if (body.action === 'disable') {
    const stored = getPasswordHash(user.id);
    if (!stored || !verifyPassword(String(body.password ?? ''), stored)) return fail('密码不对', 400);
    if (!verifyTwoFactor(user.id, String(body.code ?? ''))) return fail('验证码或恢复码不对', 400);
    disableTwoFactor(user.id);
    return json({ ok: true, enabled: false });
  }

  return fail('参数不对', 400);
}
