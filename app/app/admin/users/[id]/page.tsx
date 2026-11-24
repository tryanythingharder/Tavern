import { formatMoney } from '@/lib/money';
import { paymentCurrency } from '@/lib/billing';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminUserDetail } from '@/lib/admin';
import { ORDER_LIST, parseList, queryOrders, reportsAgainstUser, userOrderTotals } from '@/lib/admin-query';
import { AdminUserActions } from '@/components/admin-user-actions';
import { AdminUserAge } from '@/components/admin-user-age';
import { AdminBilling } from '@/components/admin-billing';
import { AdminHeader } from '@/components/admin-header';
import { getAgeRecord } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { active: '正常', banned: '已封禁', deleted: '已注销' };
const STATUS_PILL: Record<string, string> = { active: 'p-pill--ok', banned: 'p-pill--danger', deleted: 'p-pill--outline' };
const ROLE_LABEL: Record<string, string> = { admin: '管理员', user: '普通用户' };
const KIND_LABEL: Record<string, string> = { grant: '赠送', spend: '消耗', adjust: '调整', recharge: '充值', checkin: '签到', refund: '退款' };
const CHAR_LABEL: Record<string, [string, string]> = { pending: ['待审核', 'p-pill--warn'], published: ['已公开', 'p-pill--ok'], archived: ['已下架', 'p-pill--outline'], draft: ['草稿', 'p-pill--outline'] };
const REPORT_LABEL: Record<string, [string, string]> = { open: ['待处理', 'p-pill--warn'], resolved: ['已处理', 'p-pill--ok'], dismissed: ['已驳回', 'p-pill--outline'] };
const TARGET_LABEL: Record<string, string> = { character: '角色', message: '消息', user: '用户', comment: '评论', other: '其他' };
const date = (value: number | null) => (value ? new Date(value).toLocaleString('zh-CN') : '—');

// 粗略识别设备：给管理员看「iPhone · Safari」比一整串 UA 好读，原文放 title
function device(ua: string | null): string {
  if (!ua) return '未知设备';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '其他系统';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|python/i.test(ua) ? '脚本' : '浏览器';
  return `${os} · ${browser}`;
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect('/login');
  if (!isAdmin(admin)) notFound();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const detail = adminUserDetail(id);
  if (!detail) notFound();
  const { user } = detail;
  const currency = paymentCurrency();
  const totals = userOrderTotals(id);
  const orders = queryOrders({ ...parseList({}, ORDER_LIST), per: 10 }, id);
  const against = reportsAgainstUser(id);
  const openAgainst = against.filter((report) => report.status === 'open').length;
  const age = getAgeRecord(user.id);

  const sections: [string, string, number | null][] = [
    ['actions', '操作', null], ['orders', '订单', totals.total], ['ledger', '点数流水', detail.ledger.length],
    ['reports', '举报', against.length + detail.reports.length], ['works', '作品', detail.characters.length], ['devices', '登录设备', detail.sessions.length], ['age', '年龄', null],
  ];

  return (
    <>
      <AdminHeader
        href="/admin/users"
        title={user.nickname}
        trail={[user.nickname]}
        sub={<>#{user.id} · {user.email} · <span className={`p-pill p-pill--sm ${STATUS_PILL[user.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[user.status] ?? user.status}</span>{user.role === 'admin' && <> <span className="p-pill p-pill--sm p-pill--outline">管理员</span></>}</>}
        actions={<Link className="p-btn p-btn--sm" href="/admin/users">返回列表</Link>}
      />
      <div className="p-acontent">
        <div className="p-kpis">
          <a className="p-card p-card--pad a-kpi-link" href="#ledger"><div className="p-kpi-label">余额</div><div className="p-kpi-value">{user.balance.toLocaleString('zh-CN')}</div><div className="p-kpi-delta">点 · 看流水</div></a>
          <a className="p-card p-card--pad a-kpi-link" href="#orders"><div className="p-kpi-label">累计充值</div><div className="p-kpi-value">{formatMoney(totals.paidCents, currency)}</div><div className={`p-kpi-delta${totals.pendingCount ? ' p-kpi-delta--down' : ''}`}>{totals.paidCount} 笔到账{totals.pendingCount ? ` · ${totals.pendingCount} 笔待支付` : ''}</div></a>
          <a className="p-card p-card--pad a-kpi-link" href="#reports"><div className="p-kpi-label">被举报</div><div className="p-kpi-value">{against.length}</div><div className={`p-kpi-delta${openAgainst ? ' p-kpi-delta--down' : ''}`}>{openAgainst ? `${openAgainst} 件待处理` : '没有待处理'}</div></a>
          <div className="p-card p-card--pad"><div className="p-kpi-label">今日生成</div><div className="p-kpi-value">{user.runsToday}</div><div className="p-kpi-delta">{user.tokensToday.toLocaleString('zh-CN')} tokens · 注册于 {user.createdAt ? new Date(user.createdAt).toLocaleDateString('zh-CN') : '—'}</div></div>
        </div>

        <nav className="a-sectionnav" aria-label="本页分区">
          {sections.map(([anchor, label, count]) => <a key={anchor} href={`#${anchor}`}>{label}{count !== null && <span className="a-count">{count}</span>}</a>)}
        </nav>

        <div id="actions" className="a-anchor">
          <AdminUserActions id={user.id} nickname={user.nickname} status={user.status} role={user.role} />
        </div>

        <section id="orders" className="p-card a-anchor a-section">
          <div className="p-block-head">
            <h2>订单</h2>
            <span className="p-small">共 {totals.total} 笔{totals.total > 10 ? '，这里显示最近 10 笔' : ''}</span>
            <Link className="p-btn p-btn--sm" href={`/admin/orders?user=${user.id}`}>在订单页查看全部</Link>
          </div>
          <AdminBilling orders={orders.rows} currency={currency} />
        </section>

        <section id="ledger" className="p-card a-anchor a-section">
          <div className="p-block-head"><h2>点数流水</h2><span className="p-small">最近 30 条</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table a-cards">
              <thead><tr><th>类型</th><th>变动</th><th>余额</th><th>备注</th><th>时间</th></tr></thead>
              <tbody>
                {detail.ledger.map((row) => (
                  <tr key={row.id}>
                    <td data-label="类型" className="a-primary">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td data-label="变动" className={row.amount > 0 ? 'a-plus' : 'a-minus'}>{row.amount > 0 ? '+' : ''}{row.amount.toLocaleString('zh-CN')}</td>
                    <td data-label="余额">{row.balanceAfter.toLocaleString('zh-CN')}</td>
                    <td data-label="备注" className="small">{row.note || '—'}</td>
                    <td data-label="时间" className="small">{date(row.createdAt)}</td>
                  </tr>
                ))}
                {!detail.ledger.length && <tr><td colSpan={5} className="admin-empty">没有点数流水。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section id="reports" className="p-card a-anchor a-section">
          <div className="p-block-head"><h2>举报</h2><span className="p-small">针对 TA（本人 / 作品 / 评论）{against.length} 件 · TA 提交的 {detail.reports.length} 件</span><Link className="p-btn p-btn--sm" href="/admin/reports">举报队列</Link></div>
          <div className="admin-table-wrap">
            <table className="admin-table a-cards">
              <thead><tr><th>方向</th><th>原因</th><th>对象</th><th>状态</th><th>时间</th></tr></thead>
              <tbody>
                {against.map((report) => (
                  <tr key={`a${report.id}`}>
                    <td data-label="方向" className="a-primary"><strong>被举报</strong> <span className="a-id">#{report.id}</span></td>
                    <td data-label="原因">{report.reason}{report.note && <div className="small a-sub">{report.note}</div>}</td>
                    <td data-label="对象"><Link href={`/admin/reports?status=all&q=${encodeURIComponent(report.targetId)}`}>{TARGET_LABEL[report.targetType] ?? report.targetType} #{report.targetId}</Link> · 举报人 <Link href={`/admin/users/${report.reporterId}`}>{report.reporterName}</Link></td>
                    <td data-label="状态"><span className={`p-pill p-pill--sm ${REPORT_LABEL[report.status]?.[1] ?? 'p-pill--outline'}`}>{REPORT_LABEL[report.status]?.[0] ?? report.status}</span></td>
                    <td data-label="时间" className="small">{date(report.createdAt)}</td>
                  </tr>
                ))}
                {detail.reports.map((report) => (
                  <tr key={`b${report.id}`}>
                    <td data-label="方向" className="a-primary">提交 <span className="a-id">#{report.id}</span></td>
                    <td data-label="原因">{report.reason}</td>
                    <td data-label="对象"><Link href={`/admin/reports?status=all&q=${encodeURIComponent(report.targetId)}`}>{TARGET_LABEL[report.targetType] ?? report.targetType} #{report.targetId}</Link></td>
                    <td data-label="状态"><span className={`p-pill p-pill--sm ${REPORT_LABEL[report.status]?.[1] ?? 'p-pill--outline'}`}>{REPORT_LABEL[report.status]?.[0] ?? report.status}</span></td>
                    <td data-label="时间" className="small">{date(report.createdAt)}</td>
                  </tr>
                ))}
                {!against.length && !detail.reports.length && <tr><td colSpan={5} className="admin-empty">没有相关举报。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section id="works" className="p-card a-anchor a-section">
          <div className="p-block-head"><h2>作品</h2><span className="p-small">{detail.characters.length} 个</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table a-cards">
              <thead><tr><th>角色</th><th>状态</th><th>创建时间</th><th><span className="sr-only">操作</span></th></tr></thead>
              <tbody>
                {detail.characters.map((character) => (
                  <tr key={character.id}>
                    <td data-label="角色" className="a-primary"><strong>{character.name}</strong></td>
                    <td data-label="状态"><span className={`p-pill p-pill--sm ${CHAR_LABEL[character.status]?.[1] ?? 'p-pill--outline'}`}>{CHAR_LABEL[character.status]?.[0] ?? character.status}</span></td>
                    <td data-label="创建时间" className="small">{date(character.createdAt)}</td>
                    <td data-label="操作">
                      <div className="admin-actions">
                        <Link className="p-btn p-btn--sm" href={`/c/${character.id}`}>查看</Link>
                        <Link className="p-btn p-btn--sm" href={`/admin/review?status=all&q=${encodeURIComponent(character.id)}`}>去审核页</Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {!detail.characters.length && <tr><td colSpan={4} className="admin-empty">没有作品。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section id="devices" className="p-card a-anchor a-section">
          <div className="p-block-head"><h2>登录设备</h2><span className="p-small">{detail.sessions.length} 个有效会话 · 封禁会让全部会话立即失效</span></div>
          <div className="admin-table-wrap">
            <table className="admin-table a-cards">
              <thead><tr><th>设备</th><th>IP</th><th>登录时间</th><th>有效至</th></tr></thead>
              <tbody>
                {detail.sessions.map((session) => (
                  <tr key={session.token}>
                    <td data-label="设备" className="a-primary" title={session.userAgent ?? ''}>{device(session.userAgent)}</td>
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

        <div id="age" className="a-anchor a-section">
          <AdminUserAge id={user.id} birthDate={age.birthDate} verifiedAt={age.verifiedAt} method={age.verifyMethod} />
        </div>
        <p className="p-small" style={{ marginTop: 16 }}>角色：{ROLE_LABEL[user.role] ?? user.role} · 账号操作会记入审计日志。</p>
      </div>
    </>
  );
}
