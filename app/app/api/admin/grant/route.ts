import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { grantPoints } from '@/lib/points';
import { notify } from '@/lib/notifications';
import { logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/admin/grant —— { userId, amount, note }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);

  const body = (await request.json().catch(() => ({}))) as { userId?: number; amount?: number; note?: string };
  const userId = Number(body.userId);
  const amount = Number(body.amount);
  if (!Number.isInteger(userId) || userId <= 0) return fail('用户不对', 400);
  if (!Number.isFinite(amount) || amount === 0) return fail('点数不对', 400);

  const note = String(body.note ?? '').trim().slice(0, 60) || (amount > 0 ? '管理员赠送' : '管理员扣除');
  const balance = grantPoints(userId, amount, note, amount > 0 ? 'grant' : 'adjust');
  if (amount > 0) notify(userId, { type: 'points', title: `收到 ${amount} 点`, body: note, link: '/me/points' });
  logAdmin(user.id, amount > 0 ? '赠点' : '扣点', `用户 #${userId} ${amount > 0 ? '+' : ''}${amount} 点 · ${note}`);
  return json({ ok: true, balance });
}
