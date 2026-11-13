import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listLedger, pointsSummary } from '@/lib/points';
import { checkinStatus } from '@/lib/checkin';
import { listOrders, pricePerPointCents } from '@/lib/billing';
import { PointsActions } from '@/components/points-actions';
import { CheckinCard } from '@/components/checkin-card';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { grant: '赠送', spend: '生成消耗', adjust: '调整', recharge: '充值', checkin: '签到' };

export default async function PointsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const summary = pointsSummary(user.id);
  const ledger = listLedger(user.id, 100);

  return (
    <section className="p-section" id="points">
      <h2>点数与充值</h2>
      <p>生成按 token 计费：每 1000 tokens 扣 {summary.perThousand} 点（不足 1 点按 1 点算）。</p>
      <div className="p-card p-card--pad">
        <div className="p-detail-stats">
          <div className="p-stat"><div className="p-stat-n">{summary.balance.toLocaleString('zh-CN')}</div><div className="p-stat-l">当前余额</div></div>
          <div className="p-stat"><div className="p-stat-n">{summary.spent.toLocaleString('zh-CN')}</div><div className="p-stat-l">累计消耗</div></div>
          <div className="p-stat"><div className="p-stat-n">{summary.gained.toLocaleString('zh-CN')}</div><div className="p-stat-l">累计获得</div></div>
        </div>
        {summary.low && <p className="p-form-error">余额不多了，生成会被暂停。请联系管理员充值。</p>}
      </div>
      <div style={{ marginTop: 16 }}><CheckinCard initial={checkinStatus(user.id)} /></div>
      <div style={{ marginTop: 16 }}><PointsActions orders={listOrders(user.id)} pricePerPointCents={pricePerPointCents()} /></div>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">点数记录</h2>
        <p className="p-small">每次生成结束后按网关返回的 usage 扣费，账本逐笔可对。</p>
        <div className="p-rows">
          {ledger.map((row) => (
            <div className="p-room-card" key={row.id} style={{ padding: '12px 16px' }}>
              <div className="p-room-main">
                <div className="p-room-title">
                  <span>{KIND_LABEL[row.kind] ?? row.kind} · {row.note || '—'}</span>
                  <span className="p-pill p-pill--sm p-pill--outline">{row.balanceAfter}</span>
                </div>
                <p className="p-room-last">{new Date(row.createdAt).toLocaleString('zh-CN')}</p>
              </div>
              <span className="p-work-stat" style={{ color: row.amount < 0 ? 'var(--ca-danger, #c0362c)' : 'var(--ok, #2e7d43)' }}>
                {row.amount > 0 ? '+' : ''}{row.amount}
              </span>
            </div>
          ))}
          {!ledger.length && <p className="p-small">还没有记录。</p>}
        </div>
      </section>
    </section>
  );
}
