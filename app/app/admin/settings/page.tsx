import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminSettings } from '@/components/admin-settings';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>接口配置</h1>
          <div className="p-atoolbar-sub">生图、语音、支付与邮件的运行时配置；密钥只写不读</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminSettings />
      </div>
    </>
  );
}
