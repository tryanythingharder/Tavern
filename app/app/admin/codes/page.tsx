import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { listCodes } from '@/lib/billing';
import { AdminCodes } from '@/components/admin-codes';

export const dynamic = 'force-dynamic';

export default async function AdminCodesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const codes = listCodes(100);

  return (
    <>
      <AdminHeader href="/admin/codes" sub={<>批量生成兑换码 · 用户可在「我的 · 点数」兑换</>} />
      <div className="p-acontent">
        <AdminCodes initial={codes} />
      </div>
    </>
  );
}
