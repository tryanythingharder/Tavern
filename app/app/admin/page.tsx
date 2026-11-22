import { formatMoney } from '@/lib/money';
import { paymentCurrency } from '@/lib/billing';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminTotals } from '@/lib/admin';
import { AdminReports } from '@/components/admin-reports';
import { getReportTarget, listReports, openReportCount } from '@/lib/moderation';
import { listRecentOrders } from '@/lib/billing';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { pending: '待支付', paid: '已到账', cancelled: '已取消', refunded: '已退款' };
const yuan = (cents: number) => formatMoney(cents, paymentCurrency());

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();

  const totals = adminTotals();
  const pending = openReportCount();
  const reports = listReports('open').map((report) => ({ ...report, target: getReportTarget(report) }));
  const orders = listRecentOrders(8);

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>概览</h1>
          <div className="p-atoolbar-sub">后台数据与待处理事项</div>
        </div>
        <div className="p-atoolbar-actions">
          <a className="p-btn p-btn--sm" href="/admin">刷新</a>
          <Link className="p-btn p-btn--sm" href="/admin/reports">全部队列</Link>
        </div>
      </header>

      <div className="p-acontent">
        <div className="p-kpis">
          <div className="p-card p-card--pad">
            <div className="p-kpi-label">玩家总数</div>
            <div className="p-kpi-value">{totals.users.toLocaleString('zh-CN')}</div>
            <div className="p-kpi-delta">注册账号</div>
          </div>
          <div className="p-card p-card--pad">
            <div className="p-kpi-label">今日订单</div>
            <div className="p-kpi-value">{totals.ordersToday}</div>
            <div className="p-kpi-delta">收入 {yuan(totals.revenueToday)}</div>
          </div>
          <div className="p-card p-card--pad">
            <div className="p-kpi-label">待处理举报</div>
            <div className="p-kpi-value">{pending}</div>
            <div className={`p-kpi-delta${pending ? ' p-kpi-delta--down' : ''}`}>{pending ? '需要处理' : '队列已清空'}</div>
          </div>
          <div className="p-card p-card--pad">
            <div className="p-kpi-label">今日 tokens</div>
            <div className="p-kpi-value">{totals.tokens.toLocaleString('zh-CN')}</div>
            <div className="p-kpi-delta">生成 {totals.runs} 次 · 消耗 {totals.spentToday.toLocaleString('zh-CN')} 点</div>
            <div className="p-kpi-delta">
              {totals.upstreamCostToday > 0
                ? `上游成本 ${yuan(totals.upstreamCostToday)} · 毛利 ${yuan(totals.marginToday)}`
                : '上游成本未配置'}
            </div>
          </div>
        </div>

        <section className="p-card p-admin-modules">
          <div className="p-block-head">
            <h2>管理模块</h2>
            <span className="p-small">内容、用户与交易、配置</span>
          </div>
          <p className="p-admin-modules-intro">后台不只是数据概览。点击任意模块进入对应管理界面。</p>
          <div className="p-admin-module-grid">
            <Link className="p-admin-module" href="/admin/review"><strong>广场审核</strong><span>{totals.pendingCharacters} 件待审核 · 用户作品上下架</span></Link>
            <Link className="p-admin-module" href="/admin/reports"><strong>举报处理</strong><span>{pending} 件待处理 · 处理结果通知举报人</span></Link>
            <Link className="p-admin-module" href="/admin/users"><strong>玩家</strong><span>{totals.users} 个账号 · 余额、封禁、赠点</span></Link>
            <Link className="p-admin-module" href="/admin/orders"><strong>订单</strong><span>充值订单与到账确认</span></Link>
            <Link className="p-admin-module" href="/admin/codes"><strong>卡密</strong><span>批量生成兑换码</span></Link>
            <Link className="p-admin-module" href="/admin/invites"><strong>邀请码</strong><span>生成邀请码，注册可填</span></Link>
            <Link className="p-admin-module" href="/admin/content"><strong>内容分级</strong><span>18+ 总开关、地区规则、年龄验证</span></Link>
            <Link className="p-admin-module" href="/admin/announcement"><strong>公告</strong><span>编辑玩家端顶部公告</span></Link>
            <Link className="p-admin-module" href="/admin/channels"><strong>渠道</strong><span>多线路、优先级、从上游拉取模型</span></Link>
            <Link className="p-admin-module" href="/admin/settings/billing"><strong>计费与增长</strong><span>扣点 / 支付渠道 / 福利 / 上下文</span></Link>
            <Link className="p-admin-module" href="/admin/settings/image"><strong>扩展能力</strong><span>生图 / 语音 / 向量记忆 / 邮件</span></Link>
            <Link className="p-admin-module" href="/admin/services/legal"><strong>站点与服务</strong><span>运营主体 / Stripe / 存储 / 备份 / 告警 / 审核</span></Link>
            <Link className="p-admin-module" href="/admin/audit"><strong>审计日志</strong><span>敏感操作留痕</span></Link>
          </div>
        </section>

        <section className="p-card p-block">
          <div className="p-block-head">
            <h2>待处理举报</h2>
            <span className="p-pill p-pill--sm p-pill--outline">{pending} 件</span>
            <Link className="p-btn p-btn--sm" href="/admin/reports">全部队列</Link>
          </div>
          <div style={{ padding: '0 20px 18px' }}>
            <AdminReports reports={reports.slice(0, 5)} />
          </div>
        </section>

        <section className="p-card p-block">
          <div className="p-block-head">
            <h2>最近订单</h2>
            <Link className="p-btn p-btn--sm" href="/admin/orders">查看全部</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>订单</th><th>玩家</th><th>点数</th><th>金额</th><th>状态</th><th>时间</th></tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td data-label="订单">#{order.id}</td>
                    <td data-label="玩家">{order.nickname}</td>
                    <td data-label="点数">{order.points.toLocaleString('zh-CN')}</td>
                    <td data-label="金额">{yuan(order.priceCents)}</td>
                    <td data-label="状态">{STATUS_LABEL[order.status] ?? order.status}</td>
                    <td data-label="时间">{new Date(order.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
                {!orders.length && <tr><td colSpan={6} className="admin-empty">还没有订单。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
