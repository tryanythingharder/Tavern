import { paymentCurrency as __cur } from '@/lib/billing';
import Link from 'next/link';
import { tr } from '@/lib/i18n/runtime';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listLedger, pointsSummary } from '@/lib/points';
import { availableModels } from '@/lib/model';
import { checkinStatus } from '@/lib/checkin';
import { listOrders, pricePerPointCents } from '@/lib/billing';
import { PointsActions } from '@/components/points-actions';
import { CheckinCard } from '@/components/checkin-card';
import { GrowthCard } from '@/components/invite-card';
import { dailyFreeRemaining, firstTopupEligible, growthConfig, referralCode, referralStats } from '@/lib/growth';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { grant: '赠送', spend: '生成消耗', adjust: '结算调整', recharge: '充值', checkin: '每日签到', bonus: '奖励', free: '免费额度' };

// 账本备注里带内部引用（chat:1、room:2、预扣 · …），转成人能读的文字
function humanNote(raw: string | null | undefined): { text: string; chatId?: number } {
  if (!raw) return { text: '' };
  let text = raw;
  const chat = /chat:(\d+)/.exec(text);
  text = text
    .replace(/^结算退回\s*·\s*/, '多扣退回 · ')
    .replace(/^补扣\s*·\s*/, '用量补扣 · ')
    .replace(/^预扣\s*·\s*/, '')
    .replace(/chat:(\d+)/g, '对话 #$1')
    .replace(/room:(\d+)/g, '房间 #$1')
    .replace(/\s*·\s*$/, '')
    .replace(/^代写(?=\s|·|$)/, () => tr('代写'));
  return { text, chatId: chat ? Number(chat[1]) : undefined };
}

type LedgerRow = { id: number; kind: string; note: string | null; amount: number; balanceAfter: number; createdAt: number };

function groupByDay(rows: LedgerRow[]) {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const out: { key: string; label: string; net: number; rows: LedgerRow[] }[] = [];
  for (const row of rows) {
    const d = new Date(row.createdAt);
    const key = d.toDateString();
    let day = out[out.length - 1];
    if (!day || day.key !== key) {
      const label = key === today.toDateString() ? '今天' : key === yesterday.toDateString() ? '昨天' : `${d.getFullYear() === today.getFullYear() ? '' : `${d.getFullYear()}年`}${d.getMonth() + 1}月${d.getDate()}日`;
      day = { key, label, net: 0, rows: [] };
      out.push(day);
    }
    day.rows.push(row);
    day.net += row.amount;
  }
  return out;
}

export default async function PointsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const summary = pointsSummary(user.id);
  const ledger = listLedger(user.id, 100);
  const days = groupByDay(ledger as LedgerRow[]);
  const growth = growthConfig();
  const inviteOn = growth.inviteReward > 0 || growth.inviteeBonus > 0;
  const stats = inviteOn ? referralStats(user.id) : { joined: 0, active: 0 };

  return (
    <section className="p-section" id="points">
      <h2>点数与充值</h2>
      <p>不同模型计费不同：有的按 token 计（不足 1 点按 1 点算），有的每次固定扣点，长上下文可能另有价格，在对话里点模型名就能换。</p>
      <ul className="pt-prices" aria-label="各模型价格">
        {availableModels().map((item) => (
          <li key={item.id}><span>{item.id}</span><b>{item.priceLabel}</b></li>
        ))}
        {!availableModels().length && <li><span>默认模型</span><b>{summary.perThousand} 点 / 千 tokens</b></li>}
      </ul>
      <div className="p-card p-card--pad">
        <div className="p-detail-stats">
          <div className="p-stat"><div className="p-stat-n">{summary.balance.toLocaleString('zh-CN')}</div><div className="p-stat-l">当前余额</div></div>
          <div className="p-stat"><div className="p-stat-n">{summary.spent.toLocaleString('zh-CN')}</div><div className="p-stat-l">累计消耗</div></div>
          <div className="p-stat"><div className="p-stat-n">{summary.gained.toLocaleString('zh-CN')}</div><div className="p-stat-l">累计获得</div></div>
        </div>
        {summary.low && <p className="p-form-error">余额不多了，生成会被暂停。请联系管理员充值。</p>}
      </div>
      <div style={{ marginTop: 16 }}><CheckinCard initial={checkinStatus(user.id)} /></div>
      <div style={{ marginTop: 16 }}>
        <GrowthCard
          dailyFree={growth.dailyFree}
          dailyLeft={dailyFreeRemaining(user.id)}
          firstTopupPct={growth.firstTopupPct}
          firstTopup={firstTopupEligible(user.id)}
          inviteReward={growth.inviteReward}
          inviteeBonus={growth.inviteeBonus}
          code={inviteOn ? referralCode(user.id) : null}
          joined={stats.joined}
          active={stats.active}
        />
      </div>
      <div style={{ marginTop: 16 }}><PointsActions orders={listOrders(user.id)} pricePerPointCents={pricePerPointCents()} currency={__cur()} /></div>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">点数记录</h2>
        <p className="p-small">每次生成结束后按网关返回的 usage 扣费，账本逐笔可对。</p>
        {ledger.length ? (
          <div className="pt-ledger">
            {days.map((day, index) => {
              const body = (
                <ol className="pt-rows">
                  {day.rows.map((row) => {
                    const note = humanNote(row.note);
                    return (
                      <li className="pt-row" key={row.id}>
                        <span className="pt-time">{new Date(row.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                        <span className="pt-what">
                          <b>{KIND_LABEL[row.kind] ?? '其他'}</b>
                          {note.text && <span> · {note.chatId ? <Link href={`/chats/${note.chatId}`}>{note.text}</Link> : note.text}</span>}
                        </span>
                        <span className={`pt-amt ${row.amount >= 0 ? 'is-in' : 'is-out'}`}>{row.amount > 0 ? '+' : row.amount < 0 ? '−' : ''}{Math.abs(row.amount)}</span>
                        <span className="pt-bal" title="变动后余额">{row.balanceAfter.toLocaleString('zh-CN')}</span>
                      </li>
                    );
                  })}
                </ol>
              );
              const head = (
                <>
                  <span>{day.label}</span>
                  <span className="pt-day-sum">{day.net > 0 ? '+' : day.net < 0 ? '−' : ''}{Math.abs(day.net)}</span>
                </>
              );
              return index < 3 ? (
                <section className="pt-day" key={day.key}><h3 className="pt-day-h">{head}</h3>{body}</section>
              ) : (
                <details className="pt-day" key={day.key}><summary className="pt-day-h">{head}</summary>{body}</details>
              );
            })}
          </div>
        ) : (
          <p className="p-small">还没有记录。</p>
        )}
      </section>
    </section>
  );
}
