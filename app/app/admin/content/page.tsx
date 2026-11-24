import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminContent } from '@/components/admin-content';
import { UnsavedGuard } from '@/components/admin-feedback';

export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  return (
    <>
      <AdminHeader href="/admin/content" sub={<>18+ 总开关、广场默认过滤、按地区屏蔽或要求年龄验证</>} />
      <div className="p-acontent">
        <UnsavedGuard><AdminContent /></UnsavedGuard>
      </div>
    </>
  );
}
