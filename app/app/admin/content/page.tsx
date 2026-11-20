import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminContent } from '@/components/admin-content';

export const dynamic = 'force-dynamic';

export default async function AdminContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>内容分级</h1>
          <div className="p-atoolbar-sub">18+ 总开关、广场默认过滤、按地区屏蔽或要求年龄验证</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminContent />
      </div>
    </>
  );
}
