import { formatMoney } from '@/lib/money';
import { paymentCurrency } from '@/lib/billing';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminTotals } from '@/lib/admin';
import { getReportTarget } from '@/lib/moderation';
import { ORDER_LIST, REPORT_LIST, REVIEW_LIST, parseList, queryCharacters, queryOrders, queryReports, userStatusCounts } from '@/lib/admin-query';
import { AdminHeader } from '@/components/admin-header';
import { LocalTime } from '@/components/local-time';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, [string, string]> = { pending: ['待支付', 'p-pill--warn'], paid: ['已到账', 'p-pill--ok'], cancelled: ['已取消', 'p-pill--outline'], refunded: ['已退款', 'p-pill--danger'] };
const TARGET_LABEL: Record<string, string> = { character: '角色', message: '消息', user: '用户', comment: '评论', other: '其他' };
const yuan = (cents: number) => formatMoney(cents, paymentCurrency());
const n = (value: number) => value.toLocaleString('zh-CN');

// 概览：上面一行是「待办」（数字>0 时高亮，点进去就是对应的筛选列表），下面一行是今日数据；
// 队列只做只读预览，处理动作统一去列表页做（避免在首页误点）。
export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  const totals = adminTotals();
  const reports = queryReports({ ...parseList({}, REPORT_LIST), per: 5 });
  const review = queryCharacters({ ...parseList({}, REVIEW_LIST), per: 5 });
  const orders = queryOrders({ ...parseList({}, ORDER_LIST), per: 8 });
  const userCounts = userStatusCounts();
  const todo = [
    { href: '/admin/review', label: '待审核作品', value: review.total, hint: '用户提交的角色，审核后才上广场' },
    { href: '/admin/reports', label: '待处理举报', value: reports.total, hint: '处理结果会通知举报人' },
    { href: '/admin/orders?status=pending', label: '待支付订单', value: totals.pendingOrders, hint: '线下收款的需要手动确认到账' },
  ];

  return (
    <>
      <AdminHeader href="/admin" title="概览" sub="待办事项与今日数据 · 点任意卡片进入对应列表" actions={<a className="p-btn p-btn--sm" href="/admin">刷新</a>} />

      <div className="p-acontent">
        <h2 className="a-h2">待办</h2>
        <div className="p-kpis a-kpis-3">
          {todo.map((item) => (
            <Link key={item.href} className={`p-card p-card--pad a-kpi-link${item.value ? ' a-kpi-todo' : ''}`} href={item.href}>
              <div className="p-kpi-label">{item.label}</div>
              <div className="p-kpi-value">{n(item.value)}</div>
              <div className={`p-kpi-delta${item.value ? ' p-kpi-delta--down' : ''}`}>{item.value ? `去处理 →` : '已清空'}</div>
              <div className="p-kpi-delta">{item.hint}</div>
            </Link>
          ))}
        </div>

        <h2 className="a-h2">今日</h2>
        <div className="p-kpis">
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/orders?status=paid">
            <div className="p-kpi-label">今日收入</div>
            <div className="p-kpi-value">{yuan(totals.revenueToday)}</div>
            <div className="p-kpi-delta">{totals.ordersToday} 笔到账</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/users?sort=created&dir=desc">
            <div className="p-kpi-label">玩家总数</div>
            <div className="p-kpi-value">{n(totals.users)}</div>
            <div className="p-kpi-delta">看最新注册 →</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/users?status=banned">
            <div className="p-kpi-label">已封禁</div>
            <div className="p-kpi-value">{n(userCounts.banned ?? 0)}</div>
            <div className="p-kpi-delta">账号</div>
          </Link>
          <Link className="p-card p-card--pad a-kpi-link" href="/admin/users?sort=tokens&dir=desc">
            <div className="p-kpi-label">今日 tokens</div>
            <div className="p-kpi-value">{n(totals.tokens)}</div>
            <div className="p-kpi-delta">生成 {totals.runs} 次 · 消耗 {n(totals.spentToday)} 点</div>
            <div className="p-kpi-delta">{totals.upstreamCostToday > 0 ? `上游成本 ${yuan(totals.upstreamCostToday)} · 毛利 ${yuan(totals.marginToday)}` : '上游成本未配置'}</div>
          </Link>
        </div>

        <div className="a-dash-grid">
          <section className="p-card p-block">
            <div className="p-block-head">
              <h2>待处理举报</h2>
              <span className="p-pill p-pill--sm p-pill--outline">{reports.total} 件</span>
              <Link className="p-btn p-btn--sm" href="/admin/reports">去处理</Link>
            </div>
            <ul className="a-preview">
              {reports.rows.map((report) => {
                const target = getReportTarget(report);
                return (
                  <li key={report.id}>
                    <Link href={`/admin/reports?q=${encodeURIComponent(report.targetId)}`}>
                      <strong>{report.reason}</strong>
                      <span className="a-sub"> · {TARGET_LABEL[report.targetType] ?? report.targetType} · {target.preview.slice(0, 40) || `#${report.targetId}`}</span>
                    </Link>
                    <span className="small a-sub"><LocalTime value={report.createdAt} /></span>
                  </li>
                );
              })}
              {!reports.rows.length && <li className="admin-empty">队列已清空。</li>}
            </ul>
          </section>

          <section className="p-card p-block">
            <div className="p-block-head">
              <h2>待审核作品</h2>
              <span className="p-pill p-pill--sm p-pill--outline">{review.total} 个</span>
              <Link className="p-btn p-btn--sm" href="/admin/review">去审核</Link>
            </div>
            <ul className="a-preview">
              {review.rows.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/review?q=${encodeURIComponent(row.id)}`}>
                    <strong>{row.name}</strong>
                    <span className="a-sub"> · {row.ownerName ?? row.author} · {row.category}{row.nsfw ? ' · 18+' : ''}</span>
                  </Link>
                  <span className="small a-sub">{row.createdAt ? <LocalTime value={row.createdAt} /> : '—'}</span>
                </li>
              ))}
              {!review.rows.length && <li className="admin-empty">没有待审核的作品。</li>}
            </ul>
          </section>
        </div>

        <section className="p-card p-block a-section">
          <div className="p-block-head">
            <h2>最近订单</h2>
            <Link className="p-btn p-btn--sm" href="/admin/orders">全部订单</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table a-cards">
              <thead>
                <tr><th>订单</th><th>玩家</th><th>点数</th><th>金额</th><th>状态</th><th>时间</th></tr>
              </thead>
              <tbody>
                {orders.rows.map((order) => (
                  <tr key={order.id}>
                    <td data-label="订单" className="a-primary"><Link href={`/admin/orders?q=${order.id}`}>#{order.id}</Link></td>
                    <td data-label="玩家"><Link href={`/admin/users/${order.userId}`}>{order.nickname}</Link></td>
                    <td data-label="点数">{n(order.points)}</td>
                    <td data-label="金额">{yuan(order.priceCents)}</td>
                    <td data-label="状态"><span className={`p-pill p-pill--sm ${STATUS_LABEL[order.status]?.[1] ?? 'p-pill--outline'}`}>{STATUS_LABEL[order.status]?.[0] ?? order.status}</span></td>
                    <td data-label="时间" className="small"><LocalTime value={order.createdAt} /></td>
                  </tr>
                ))}
                {!orders.rows.length && <tr><td colSpan={6} className="admin-empty">还没有订单。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
