import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { announcementSetting } from '@/lib/announcement';
import { AdminAnnouncement } from '@/components/admin-announcement';

export const dynamic = 'force-dynamic';

export default async function AdminAnnouncementPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>公告</h1>
          <div className="p-atoolbar-sub">编辑玩家端顶部的社区提醒</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminAnnouncement initial={announcementSetting()} />
      </div>
    </>
  );
}
