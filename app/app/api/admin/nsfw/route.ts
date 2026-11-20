import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { adminSetAge, getAgeRecord, getPolicy, requestRegion, setPolicy } from '@/lib/age-gate';
import { providerSummary as verifyProviders } from '@/lib/age-verify';
import { activeProvider as activePayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

// 收款渠道对成人内容的政策：Stripe 的受限业务清单不允许成人内容
const ADULT_UNFRIENDLY: Record<string, string> = { stripe: 'Stripe' };

async function status() {
  const payment = activePayment();
  return {
    policy: getPolicy(),
    verifyProviders: verifyProviders(),
    payment: { id: payment.id, label: payment.label, adultRestricted: Boolean(ADULT_UNFRIENDLY[payment.id]) },
    yourRegion: await requestRegion(),
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json(await status());
}

// PATCH { policy?: Partial<NsfwPolicy> } 或 { userId, birthDate?, verified? }（手动标记某个玩家）
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { policy?: Record<string, unknown>; userId?: unknown; birthDate?: unknown; verified?: unknown };
  if (body.policy && typeof body.policy === 'object') {
    const next = setPolicy(body.policy);
    logAdmin(user.id, '修改内容分级', `18+${next.enabled ? '开' : '关'} 屏蔽${next.blockedRegions.length} 验证${next.verifyRegions.length}`);
    return json(await status());
  }
  const userId = Number(body.userId);
  if (Number.isInteger(userId) && userId > 0) {
    adminSetAge(userId, {
      ...(typeof body.birthDate === 'string' || body.birthDate === null ? { birthDate: body.birthDate as string | null } : {}),
      ...(typeof body.verified === 'boolean' ? { verified: body.verified, method: 'admin' } : {}),
    });
    logAdmin(user.id, '修改玩家年龄信息', `user:${userId}`);
    return json({ age: getAgeRecord(userId) });
  }
  return fail('参数不对', 400);
}
