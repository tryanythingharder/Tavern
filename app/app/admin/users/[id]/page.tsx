import { formatMoney } from '@/lib/money';
import { paymentCurrency } from '@/lib/billing';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminUserDetail } from '@/lib/admin';
import { AdminUserActions } from '@/components/admin-user-actions';
import { AdminUserAge } from '@/components/admin-user-age';
import { getAgeRecord } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { active: '正常', banned: '已封禁', deleted: '已注销' };
const ROLE_LABEL: Record<string, string> = { admin: '管理员', user: '普通用户' };
const ORDER_LABEL: Record<string, string> = { pending: '待支付', paid: '已到账', refunded: '已退款', cancelled: '已取消' };
const KIND_LABEL: Record<string, string> = { grant: '赠送', spend: '消耗', adjust: '调整', recharge: '充值', checkin: '签到' };
const date = (value: number | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');
const yuan = (cents: number) => formatMoney(cents, paymentCurrency());

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect('/login');
  if (!isAdmin(admin)) notFound();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = adminUserDetail(id);
  if (!detail) notFound();
  const { user } = detail;

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>{user.nickname}</h1>
          <div className="p-atoolbar-sub">
            <Link href="/admin/users">← 返回玩家列表</Link> · {user.email}
          </div>
        </div>
      </header>
      <div className="p-acontent">
        <div className="p-kpis">
          <div className="p-card p-card--pad"><div className="p-kpi-label">余额</div><div className="p-kpi-value">{user.balance.toLocaleString('zh-CN')}</div><div className="p-kpi-delta">点</div></div>
          <div className="p-card p-card--pad"><div className="p-kpi-label">今日生成</div><div className="p-kpi-value">{user.runsToday}</div><div className="p-kpi-delta">{user.tokensToday.toLocaleString('zh-CN')} tokens</div></div>
          <div className="p-card p-card--pad"><div className="p-kpi-label">角色</div><div className="p-kpi-value">{ROLE_LABEL[user.role] ?? user.role}</div><div className="p-kpi-delta">{STATUS_LABEL[user.status] ?? user.status}</div></div>
          <div className="p-card p-card--pad"><div className="p-kpi-label">注册时间</div><div className="p-kpi-value" style={{ fontSize: 18 }}>{user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '—'}</div><div className="p-kpi-delta">#{user.id}</div></div>
        </div>

        <AdminUserActions id={user.id} nickname={user.nickname} status={user.status} role={user.role} />
        {(() => { const age = getAgeRecord(user.id); return <AdminUserAge id={user.id} birthDate={age.birthDate} verifiedAt={age.verifiedAt} method={age.verifyMethod} />; })()}

        <section className="p-card" style={{ marginTop: 16 }}>
          <div className="p-block-head"><h2>最近订单</h2><Link className="p-btn p-btn--sm" href="/admin/orders">全部订单</Link></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>订单</th><th>点数</th><th>金额</th><th>状态</th><th>渠道</th><th>时间</th></tr></thead>
              <tbody>
                {detail.orders.map((order) => (
                  <tr key={order.id}>
                    <td data-label="订单">#{order.id}</td>
                    <td data-label="点数">{order.points.toLocaleString('zh-CN')}</td>
                    <td data-label="金额">{yuan(order.priceCents)}</td>
                    <td data-label="状态">{ORDER_LABEL[order.status] ?? order.status}</td>
                    <td data-label="渠道">{order.provider}</td>
                    <td data-label="时间" className="small">{date(order.createdAt)}</td>
                  </tr>
                ))}
                {!detail.orders.length && <tr><td colSpan={6} className="admin-empty">还没有订单。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="p-card" style={{ marginTop: 16 }}>
          <div className="p-block-head"><h2>点数流水</h2><span className="p-small">最近 30 条</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>类型</th><th>变动</th><th>余额</th><th>备注</th><th>时间</th></tr></thead>
              <tbody>
                {detail.ledger.map((row) => (
                  <tr key={row.id}>
                    <td data-label="类型">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td data-label="变动">{row.amount > 0 ? '+' : ''}{row.amount}</td>
                    <td data-label="余额">{row.balanceAfter}</td>
                    <td data-label="备注" className="small">{row.note || '—'}</td>
                    <td data-label="时间" className="small">{date(row.createdAt)}</td>
                  </tr>
                ))}
                {!detail.ledger.length && <tr><td colSpan={5} className="admin-empty">没有点数流水。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="p-card" style={{ marginTop: 16 }}>
          <div className="p-block-head"><h2>作品</h2><span className="p-small">{detail.characters.length} 个</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                {detail.characters.map((character) => (
                  <tr key={character.id}>
                    <td data-label="角色"><strong>{character.name}</strong></td>
                    <td data-label="状态">{character.status}</td>
                    <td data-label="创建时间" className="small">{date(character.createdAt)}</td>
                    <td data-label="操作"><Link className="p-btn p-btn--sm" href={`/c/${character.id}`}>查看</Link></td>
                  </tr>
                ))}
                {!detail.characters.length && <tr><td colSpan={4} className="admin-empty">没有作品。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="p-card" style={{ marginTop: 16 }}>
          <div className="p-block-head"><h2>登录设备</h2><span className="p-small">{detail.sessions.length} 个有效会话</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>设备</th><th>IP</th><th>登录时间</th><th>有效至</th></tr></thead>
              <tbody>
                {detail.sessions.map((session) => (
                  <tr key={session.token}>
                    <td data-label="设备" className="small">{session.userAgent ?? '未知设备'}</td>
                    <td data-label="IP" className="small">{session.ip ?? '—'}</td>
                    <td data-label="登录时间" className="small">{date(session.createdAt)}</td>
                    <td data-label="有效至" className="small">{new Date(session.expiresAt).toLocaleDateString('zh-CN')}</td>
                  </tr>
                ))}
                {!detail.sessions.length && <tr><td colSpan={4} className="admin-empty">没有有效会话。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
