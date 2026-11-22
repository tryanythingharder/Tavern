import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminServices } from '@/components/admin-services';

export const dynamic = 'force-dynamic';

export default async function AdminServicesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>站点与服务</h1>
          <div className="p-atoolbar-sub">运营主体、收款、存储、备份、告警、审核与推送；后台填写优先于环境变量，密钥只写不读</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminServices />
      </div>
    </>
  );
}
