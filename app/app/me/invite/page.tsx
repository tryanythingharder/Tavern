import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { growthConfig, inviteOverview, referralCode, referralStats } from '@/lib/growth';
import { InviteLink } from '@/components/invite-link';
import { LocalTime } from '@/components/local-time';
import { trMeta } from '@/lib/i18n/runtime';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '邀请返点' });
}

export default async function InvitePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?mode=login');
  const growth = growthConfig();
  const on = growth.inviteReward > 0 || growth.inviteeBonus > 0 || growth.rebatePct > 0;

  if (!on) {
    return (
      <section className="p-section" id="invite">
        <h2>邀请返点</h2>
        <div className="p-card p-card--pad"><p className="p-small" style={{ margin: 0 }}>邀请活动暂未开启，开启后这里会出现你的专属邀请链接。</p></div>
      </section>
    );
  }

  const code = referralCode(user.id);
  const stats = referralStats(user.id);
  const overview = inviteOverview(user.id);
  const steps: { n: string; title: string; text: string }[] = [
    { n: '1', title: '发出链接', text: '把专属链接发给朋友，打开后邀请码自动锁定为你的。' },
    { n: '2', title: '好友注册', text: growth.inviteeBonus > 0 ? `好友注册即得 ${growth.inviteeBonus} 点见面礼。` : '好友用链接完成注册即算邀请成功。' },
  ];
  if (growth.inviteReward > 0) steps.push({ n: String(steps.length + 1), title: '开始第一段故事', text: `好友第一次成功生成后，你得 ${growth.inviteReward} 点（最多 ${growth.inviteMax} 人）。` });
  if (growth.rebatePct > 0) steps.push({ n: String(steps.length + 1), title: '持续返点', text: `好友每笔充值到账，你得充值点数的 ${growth.rebatePct}%${growth.rebateDays ? `，注册后 ${growth.rebateDays} 天内有效` : '，长期有效'}。` });

  return (
    <section className="p-section" id="invite">
      <h2>邀请返点</h2>
      <p>邀请朋友来夜话，一起写故事。{growth.rebatePct > 0 ? `好友充值，你拿 ${growth.rebatePct}% 返点。` : ''}</p>

      <div className="p-card p-card--pad iv-hero">
        <InviteLink code={code} bonus={growth.inviteeBonus} />
      </div>

      <ol className="iv-steps" aria-label="怎么拿奖励">
        {steps.map((step) => (
          <li key={step.n}><span className="iv-step-n" aria-hidden="true">{step.n}</span><div><b>{step.title}</b><p className="p-small">{step.text}</p></div></li>
        ))}
      </ol>

      <div className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <div className="p-detail-stats iv-stats">
          <div className="p-stat"><div className="p-stat-n">{stats.joined}</div><div className="p-stat-l">已邀请</div></div>
          <div className="p-stat"><div className="p-stat-n">{stats.active}</div><div className="p-stat-l">已开聊</div></div>
          {growth.rebatePct > 0 && <div className="p-stat"><div className="p-stat-n">{overview.rebateTotal.toLocaleString('zh-CN')}</div><div className="p-stat-l">累计返点</div></div>}
          {growth.inviteReward > 0 && <div className="p-stat"><div className="p-stat-n">{overview.rewardTotal.toLocaleString('zh-CN')}</div><div className="p-stat-l">邀请奖励</div></div>}
        </div>
      </div>

      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">我邀请的好友</h2>
        {overview.invitees.length ? (
          <ul className="iv-list">
            {overview.invitees.map((row, index) => (
              <li key={index}>
                <span className="iv-avatar" aria-hidden="true">{row.nickname.slice(0, 1)}</span>
                <div className="iv-who"><b>{row.nickname}</b><span className="p-small"><LocalTime value={row.joinedAt} style="date" /> 加入 · {row.active ? '已开聊' : '还没开聊'}</span></div>
                {growth.rebatePct > 0 && <span className="iv-rebate">{row.rebate > 0 ? `+${row.rebate.toLocaleString('zh-CN')} 点` : '暂无返点'}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-small" style={{ margin: 0 }}>还没有好友通过你的链接注册。返点和奖励到账会记在<Link href="/me/points">点数记录</Link>里。</p>
        )}
      </section>
      <p className="p-small" style={{ marginTop: 12 }}>好友订单退款时，对应返点会扣回。自己邀请自己、批量注册等行为不计奖励。</p>
    </section>
  );
}
