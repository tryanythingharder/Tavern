import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { inviteRequired, listInvites } from '@/lib/invite';
import { AdminInvites } from '@/components/admin-invites';

export const dynamic = 'force-dynamic';

export default async function AdminInvitesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const required = inviteRequired();

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>邀请码</h1>
          <div className="p-atoolbar-sub">{required ? '注册必须填写邀请码' : '生成邀请码 · 注册时可填，不强制'}</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminInvites initial={listInvites(100)} initialRequired={required} />
      </div>
    </>
  );
}
