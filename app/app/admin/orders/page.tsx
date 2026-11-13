import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { countOrders, listAllOrders } from '@/lib/billing';
import { AdminBilling } from '@/components/admin-billing';

export const dynamic = 'force-dynamic';

const PER_PAGE = 20;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const { page } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const total = countOrders();
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const orders = listAllOrders(PER_PAGE, (current - 1) * PER_PAGE);
  const pending = orders.filter((order) => order.status === 'pending').length;

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>订单</h1>
          <div className="p-atoolbar-sub">充值订单与退款 · 本页待支付 {pending} 笔</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminBilling orders={orders} />
        <div className="p-table-foot" style={{ marginTop: 16 }}>
          <span className="p-foot-count">第 {current} / {pages} 页 · 共 {total} 笔订单</span>
          <div className="p-foot-right">
            {current > 1 && <Link className="p-btn p-btn--sm" href={`/admin/orders?page=${current - 1}`}>上一页</Link>}
            {current < pages && <Link className="p-btn p-btn--sm" href={`/admin/orders?page=${current + 1}`}>下一页</Link>}
          </div>
        </div>
      </div>
    </>
  );
}
