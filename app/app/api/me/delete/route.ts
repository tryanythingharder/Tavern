import { fail, json, requireUser } from '@/lib/api';
import { logActivity } from '@/lib/audit';
import { deleteAccountData, endSession, getPasswordHash, verifyPassword } from '@/lib/auth';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/me/delete —— { password }：确认密码后删除账号与全部个人数据
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { password?: unknown };
  const password = String(body.password ?? '');
  const stored = getPasswordHash(user.id);
  if (!stored || !verifyPassword(password, stored)) return fail('密码不对', 400);

  logActivity({ actorId: user.id, action: 'account.delete', targetType: 'user', targetId: user.id });
  deleteAccountData(user.id);
  await endSession();
  return json({ ok: true });
}
