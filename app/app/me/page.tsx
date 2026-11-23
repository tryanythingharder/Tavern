import { redirect } from 'next/navigation';
import { getAuthorBio, getCurrentUser, getProfileMedia, isEmailVerified } from '@/lib/auth';
import { usageSummary } from '@/lib/db';
import { DAILY_TOKEN_CAP, RATE_PER_MIN } from '@/lib/usage';
import { hideNsfw } from '@/lib/prefs';
import { getAgeRecord, nsfwAccess } from '@/lib/age-gate';
import { ProfileForm } from '@/components/profile-form';
import { EmailStatus } from '@/components/email-status';
import { NsfwToggle } from '@/components/nsfw-toggle';

export const dynamic = 'force-dynamic';

const formatNumber = (value: number) => value.toLocaleString('zh-CN');

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const usage = usageSummary(user.id);
  const access = await nsfwAccess(user.id);
  const ageRecord = getAgeRecord(user.id);
  const cap = DAILY_TOKEN_CAP > 0 ? formatNumber(DAILY_TOKEN_CAP) : '不限';

  return (
    <section className="p-section" id="account">
      <h2>账号</h2>
      <p>昵称会用于新作品署名和评论展示；历史内容保留发布时的名字。</p>
      <ProfileForm nickname={user.nickname} email={user.email} bio={getAuthorBio(user.id)} {...getProfileMedia(user.id)} />
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">邮箱验证</h2>
        <EmailStatus email={user.email} verified={isEmailVerified(user.id)} />
      </section>
      <div style={{ marginTop: 16 }}><NsfwToggle initial={hideNsfw(user.id)} state={access.state} minAge={access.minAge} hasBirthDate={Boolean(ageRecord.birthDate)} verified={Boolean(ageRecord.verifiedAt)} /></div>
      <section className="p-card p-card--pad" style={{ marginTop: 16 }}>
        <h2 className="p-form-section-title">生成用量</h2>
        <p className="p-small">按网关返回的 usage 记账；网关没回时按字数估算（标注为估算，不计费）。</p>
        <div className="p-detail-stats is-four" style={{ marginTop: 12 }}>
          <div className="p-stat"><div className="p-stat-n">{formatNumber(usage.todayRuns)}</div><div className="p-stat-l">今日生成次数</div></div>
          <div className="p-stat"><div className="p-stat-n">{formatNumber(usage.todayTokens)}</div><div className="p-stat-l">今日 tokens</div></div>
          <div className="p-stat"><div className="p-stat-n">{formatNumber(usage.todayPromptTokens)}</div><div className="p-stat-l">今日输入</div></div>
          <div className="p-stat"><div className="p-stat-n">{formatNumber(usage.todayCompletionTokens)}</div><div className="p-stat-l">今日输出</div></div>
        </div>
        <p className="p-hint">每分钟上限 {RATE_PER_MIN} 次 · 每日上限 {cap} tokens · 累计 {formatNumber(usage.totalRuns)} 次 · {formatNumber(usage.totalTokens)} tokens</p>
      </section>
    </section>
  );
}
