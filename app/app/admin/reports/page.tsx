import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminReports } from '@/components/admin-reports';
import { getReportTarget } from '@/lib/moderation';
import { REPORT_LIST, parseList, queryReports, reportStatusCounts, type SearchParams } from '@/lib/admin-query';
import { AdminListBar, AdminPager } from '@/components/admin-list';
import { AdminHeader } from '@/components/admin-header';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const query = parseList(await searchParams, REPORT_LIST);
  const result = queryReports(query);
  const reports = result.rows.map((report) => ({ ...report, target: getReportTarget(report) }));
  const counts = reportStatusCounts();

  return (
    <>
      <AdminHeader href="/admin/reports" sub={`待处理 ${counts.open ?? 0} 件 · 处理结果会通知举报人`} />
      <div className="p-acontent">
        <section className="p-card">
          <AdminListBar
            placeholder="搜索原因、说明、举报人或目标 ID"
            unit="件举报"
            total={result.total}
            tabs={{ key: 'status', label: '处理状态', fallback: 'open', options: [
              { value: 'open', label: '待处理', count: counts.open ?? 0 },
              { value: 'resolved', label: '已处理', count: counts.resolved ?? 0 },
              { value: 'dismissed', label: '已驳回', count: counts.dismissed ?? 0 },
              { value: '', label: '全部', count: counts[''] ?? 0 },
            ] }}
            selects={[{ key: 'type', label: '按举报对象筛选', options: [{ value: '', label: '全部对象' }, { value: 'character', label: '角色' }, { value: 'message', label: '消息' }, { value: 'user', label: '用户' }, { value: 'comment', label: '评论' }, { value: 'other', label: '其他' }] }]}
          />
          <div className="a-pad">
            <AdminReports reports={reports} filtered={Boolean(query.q || query.f.type)} />
          </div>
          <AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="件举报" />
        </section>
      </div>
    </>
  );
}
