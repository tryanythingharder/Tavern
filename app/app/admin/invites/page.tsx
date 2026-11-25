import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { inviteRequired } from '@/lib/invite';
import { INVITE_LIST, inviteStats, parseList, queryInvites, type SearchParams } from '@/lib/admin-query';
import { AdminInvites } from '@/components/admin-invites';
import { AdminListBar, AdminPager } from '@/components/admin-list';

export const dynamic = 'force-dynamic';

export default async function AdminInvitesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const required = inviteRequired();
  const query = parseList(await searchParams, INVITE_LIST);
  const result = queryInvites(query);
  const stats = inviteStats();

  return (
    <>
      <AdminHeader href="/admin/invites" sub={required ? '注册必须填写邀请码' : '生成邀请码 · 注册时可填，不强制'} />
      <div className="p-acontent">
        <AdminInvites
          rows={result.rows}
          stats={stats}
          sort={{ sort: query.sort, dir: query.dir }}
          filtered={Boolean(query.q || query.f.status)}
          initialRequired={required}
          toolbar={(
            <AdminListBar
              placeholder="邀请码、备注或玩家昵称"
              unit="个邀请码"
              total={result.total}
              tabs={{ key: 'status', label: '邀请码状态', options: [
                { value: '', label: '全部', count: stats.total },
                { value: 'unused', label: '未使用', count: stats.unused },
                { value: 'used', label: '已使用', count: stats.used },
              ] }}
            />
          )}
          pager={<AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="个邀请码" />}
        />
      </div>
    </>
  );
}
