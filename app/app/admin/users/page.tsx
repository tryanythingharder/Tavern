import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminUserCount, adminUsers } from '@/lib/admin';
import { AdminPanel } from '@/components/admin-panel';

export const dynamic = 'force-dynamic';

const PER_PAGE = 20;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const { page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const total = adminUserCount();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const users = adminUsers(PER_PAGE, (current - 1) * PER_PAGE);

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>玩家</h1>
          <div className="p-atoolbar-sub">{total} 个账号 · 余额、封禁、赠点</div>
        </div>
      </header>
      <div className="p-acontent">
        <section className="p-card">
          <AdminPanel users={users} />
          <div className="p-table-foot">
            <span className="p-foot-count">第 {current} / {pages} 页 · 共 {total} 个账号</span>
            <div className="p-foot-right">
              {current > 1 && <Link className="p-btn p-btn--sm" href={`/admin/users?page=${current - 1}`}>上一页</Link>}
              {current < pages && <Link className="p-btn p-btn--sm" href={`/admin/users?page=${current + 1}`}>下一页</Link>}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
