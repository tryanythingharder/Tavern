import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminReports } from '@/components/admin-reports';
import { getReportTarget, listReports, openReportCount } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  const reports = listReports('open').map((report) => ({ ...report, target: getReportTarget(report) }));

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>举报处理</h1>
          <div className="p-atoolbar-sub">待处理 {openReportCount()} 件 · 处理结果会通知举报人</div>
        </div>
      </header>
      <div className="p-acontent">
        <section className="p-card p-card--pad">
          <AdminReports reports={reports} />
        </section>
      </div>
    </>
  );
}
