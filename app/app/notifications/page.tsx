import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listNotifications } from '@/lib/notifications';
import { NotificationsList } from '@/components/notifications-list';
import { PushToggle } from '@/components/push-toggle';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <div className="p-inner">
      <NotificationsList initial={listNotifications(user.id)} />
      <div style={{ marginTop: 24 }}><PushToggle /></div>
    </div>
  );
}
