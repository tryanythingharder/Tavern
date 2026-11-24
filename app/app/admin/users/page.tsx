import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { USER_LIST, parseList, queryUsers, userStatusCounts, type SearchParams } from '@/lib/admin-query';
import { AdminPanel } from '@/components/admin-panel';
import { AdminListBar, AdminPager } from '@/components/admin-list';
import { AdminHeader } from '@/components/admin-header';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const query = parseList(await searchParams, USER_LIST);
  const result = queryUsers(query);
  const counts = userStatusCounts();
  const filtered = Boolean(query.q || query.f.status || query.f.role);

  return (
    <>
      <AdminHeader href="/admin/users" sub={`${counts[''] ?? 0} 个账号 · 余额、封禁、赠点`} />
      <div className="p-acontent">
        <section className="p-card">
          <AdminListBar
            placeholder="搜索昵称、邮箱或 #ID"
            unit="个账号"
            total={result.total}
            tabs={{ key: 'status', label: '账号状态', options: [
              { value: '', label: '全部', count: counts[''] ?? 0 },
              { value: 'active', label: '正常', count: counts.active ?? 0 },
              { value: 'banned', label: '已封禁', count: counts.banned ?? 0 },
              { value: 'deleted', label: '已注销', count: counts.deleted ?? 0 },
            ] }}
            selects={[{ key: 'role', label: '按角色筛选', options: [{ value: '', label: '全部角色' }, { value: 'admin', label: '管理员' }, { value: 'user', label: '普通用户' }] }]}
          />
          <AdminPanel users={result.rows} sort={{ sort: query.sort, dir: query.dir }} filtered={filtered} />
          <AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="个账号" />
        </section>
      </div>
    </>
  );
}
