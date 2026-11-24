import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { announcementSetting } from '@/lib/announcement';
import { AdminAnnouncement } from '@/components/admin-announcement';
import { UnsavedGuard } from '@/components/admin-feedback';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  return (
    <>
      <AdminHeader href="/admin/announcement" sub={<>编辑玩家端顶部的社区提醒</>} />
      <div className="p-acontent">
        <UnsavedGuard><AdminAnnouncement initial={announcementSetting()} /></UnsavedGuard>
      </div>
    </>
  );
}
