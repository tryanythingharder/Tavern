import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { CODE_LIST, codeStats, parseList, queryCodes, type SearchParams } from '@/lib/admin-query';
import { AdminCodes } from '@/components/admin-codes';
import { AdminListBar, AdminPager } from '@/components/admin-list';

export const dynamic = 'force-dynamic';

export default async function AdminCodesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const query = parseList(await searchParams, CODE_LIST);
  const result = queryCodes(query);
  const stats = codeStats();

  return (
    <>
      <AdminHeader href="/admin/codes" sub={<>批量生成兑换码 · 用户可在「我的 · 点数」兑换</>} />
      <div className="p-acontent">
        <AdminCodes
          rows={result.rows}
          stats={stats}
          sort={{ sort: query.sort, dir: query.dir }}
          filtered={Boolean(query.q || query.f.status)}
          toolbar={(
            <AdminListBar
              placeholder="兑换码、备注或玩家昵称"
              unit="个兑换码"
              total={result.total}
              tabs={{ key: 'status', label: '兑换码状态', options: [
                { value: '', label: '全部', count: stats.total },
                { value: 'unused', label: '未使用', count: stats.unused },
                { value: 'used', label: '已使用', count: stats.used },
              ] }}
            />
          )}
          pager={<AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="个兑换码" />}
        />
      </div>
    </>
  );
}
