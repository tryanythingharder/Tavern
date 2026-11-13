import { fail, json, requireUser } from '@/lib/api';
import { markAllRead } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  markAllRead(user.id);
  return json({ ok: true });
}
