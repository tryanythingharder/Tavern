import { fail, json, requireUser } from '@/lib/api';
import { listNotifications, unreadCount } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ notifications: listNotifications(user.id), unread: unreadCount(user.id) });
}
