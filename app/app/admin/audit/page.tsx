import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { countAudit, listAudit } from '@/lib/audit';
import { AdminAudit } from '@/components/admin-audit';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const { page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const total = countAudit();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const entries = listAudit(PER_PAGE, (current - 1) * PER_PAGE);

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>审计日志</h1>
          <div className="p-atoolbar-sub">赠点、封禁、订单确认、配置修改等敏感操作留痕</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminAudit initial={entries} />
        <div className="p-table-foot" style={{ marginTop: 16 }}>
          <span className="p-foot-count">第 {current} / {pages} 页 · 共 {total} 条</span>
          <div className="p-foot-right">
            {current > 1 && <Link className="p-btn p-btn--sm" href={`/admin/audit?page=${current - 1}`}>上一页</Link>}
            {current < pages && <Link className="p-btn p-btn--sm" href={`/admin/audit?page=${current + 1}`}>下一页</Link>}
          </div>
        </div>
      </div>
    </>
  );
}
