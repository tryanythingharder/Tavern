import { paymentCurrency } from '@/lib/billing';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ORDER_LIST, orderStats, orderStatusCounts, parseList, queryOrders, type SearchParams } from '@/lib/admin-query';
import db from '@/lib/db';
import { AdminBilling, OrderKpis } from '@/components/admin-billing';
import { AdminListBar, AdminPager } from '@/components/admin-list';
import { AdminHeader } from '@/components/admin-header';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const sp = await searchParams;
  const query = parseList(sp, ORDER_LIST);
  // ?user=ID：只看某个玩家的订单（从玩家详情跳过来）
  const userId = Number(Array.isArray(sp.user) ? sp.user[0] : sp.user) || 0;
  const owner = userId ? db.prepare('SELECT nickname FROM users WHERE id = ?').get(userId) as { nickname: string } | undefined : undefined;
  const result = queryOrders(query, owner ? userId : undefined);
  const counts = orderStatusCounts(owner ? userId : undefined);
  const stats = orderStats();

  return (
    <>
      <AdminHeader
        href="/admin/orders"
        trail={owner ? [owner.nickname] : []}
        title={owner ? `${owner.nickname} 的订单` : undefined}
        sub={owner ? <>只显示这个玩家的订单 · <a href="/admin/orders">看全部订单</a></> : `充值订单与退款 · 待支付 ${stats.pending.n} 笔`}
      />
      <div className="p-acontent">
        {!owner && <OrderKpis stats={stats} currency={paymentCurrency()} />}
        <section className="p-card">
          <AdminListBar
            placeholder="订单号、玩家昵称或邮箱"
            unit="笔订单"
            total={result.total}
            tabs={{ key: 'status', label: '订单状态', options: [
              { value: '', label: '全部', count: counts[''] ?? 0 },
              { value: 'pending', label: '待支付', count: counts.pending ?? 0 },
              { value: 'paid', label: '已到账', count: counts.paid ?? 0 },
              { value: 'refunded', label: '已退款', count: counts.refunded ?? 0 },
              { value: 'cancelled', label: '已取消', count: counts.cancelled ?? 0 },
            ] }}
          />
          <AdminBilling orders={result.rows} currency={paymentCurrency()} sort={{ sort: query.sort, dir: query.dir }} filtered={Boolean(query.q || query.f.status)} />
          <AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="笔订单" />
        </section>
      </div>
    </>
  );
}
