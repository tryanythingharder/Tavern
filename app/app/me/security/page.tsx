import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, listSessions, twoFactorStatus } from '@/lib/auth';
import { getBlockedAuthors } from '@/lib/blocked';
import { listReportsByReporter } from '@/lib/moderation';
import { SessionsPanel } from '@/components/sessions-panel';
import { BlockedAuthors } from '@/components/blocked-authors';
import { DangerZone } from '@/components/danger-zone';
import { TwoFactorSettings } from '@/components/two-factor-settings';

export const dynamic = 'force-dynamic';

const REPORT_STATUS: Record<string, { label: string; className: string }> = {
  open: { label: '处理中', className: 'p-pill--warn' },
  resolved: { label: '已处理', className: 'p-pill--ok' },
  dismissed: { label: '已驳回', className: 'p-pill--outline' },
};

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ require2fa?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { require2fa } = await searchParams;
  const sessions = await listSessions(user.id);
  const blocked = await getBlockedAuthors();
  const reports = listReportsByReporter(user.id, 20);
  const twoFactor = twoFactorStatus(user.id);

  return (
    <section className="p-section" id="security">
      <h2>安全与隐私</h2>
      <p>登录设备、屏蔽名单、举报记录和账号数据。</p>
      <section className="p-card p-card--pad">
        <h3 className="p-form-section-title">登录设备</h3>
        <SessionsPanel initial={sessions} />
      </section>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h3 className="p-form-section-title">两步验证（2FA）</h3>
        <TwoFactorSettings initial={twoFactor} required={require2fa === '1'} />
      </section>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h3 className="p-form-section-title">已屏蔽的创作者</h3>
        <BlockedAuthors initial={blocked} />
      </section>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h3 className="p-form-section-title">举报记录</h3>
        <div className="p-rows">
          {reports.map((report) => {
            const status = REPORT_STATUS[report.status] ?? { label: report.status, className: 'p-pill--outline' };
            return (
              <div className="p-room-card" key={report.id} style={{ padding: '12px 16px' }}>
                <div className="p-room-main">
                  <div className="p-room-title"><span>{report.reason}</span><span className={`p-pill p-pill--sm ${status.className}`}>{status.label}</span></div>
                  <p className="p-room-last">{report.targetType} · {new Date(report.createdAt).toLocaleString('zh-CN')}{report.note ? ` · ${report.note}` : ''}</p>
                </div>
              </div>
            );
          })}
          {!reports.length && <p className="p-small" style={{ margin: 0 }}>还没有提交过举报。</p>}
        </div>
      </section>
      <div className="p-card p-rows" style={{ marginTop: 16 }}>
        <a className="p-row" href="/api/me/export" download>
          <div className="p-row-main"><div className="p-row-title">导出我的数据</div><div className="p-row-sub">角色、身份、会话、通知和举报记录（不含密码与密钥）</div></div>
          <span className="p-small">下载 JSON →</span>
        </a>
      </div>
      <Link className="p-btn p-btn--danger" href="/logout" prefetch={false} style={{ marginTop: 20 }}>退出登录</Link>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h3 className="p-form-section-title">注销账号</h3>
        <p className="p-small" style={{ marginTop: 0 }}>永久删除账号与全部个人数据，无法恢复。建议先导出数据。</p>
        <DangerZone />
      </section>
    </section>
  );
}
