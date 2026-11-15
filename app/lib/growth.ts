import { randomInt } from 'node:crypto';
import db, { transaction } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { grantPoints } from '@/lib/points';
import { notify } from '@/lib/notifications';

// 增长：每日免费额度、首充赠送、邀请好友奖励。
// 三项都由后台「计费」卡配置（数据库优先，环境变量兜底），值为 0 时功能关闭、界面不显示。

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_free_usage (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  CREATE TABLE IF NOT EXISTS referral_codes (
    user_id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS referrals (
    invitee_id INTEGER PRIMARY KEY,
    referrer_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    rewarded_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
`);

const int = (key: string, env: string | undefined, max: number) => Math.max(0, Math.min(max, Math.round(Number(getSetting(key, env ?? '0')) || 0)));

export function growthConfig() {
  return {
    dailyFree: int('growth.dailyFree', process.env.TAVERN_DAILY_FREE, 100000), // 每天免费可用的点数
    firstTopupPct: int('growth.firstTopupPct', process.env.TAVERN_FIRST_TOPUP_PCT, 300), // 首充额外赠送百分比
    inviteReward: int('growth.inviteReward', process.env.TAVERN_INVITE_REWARD, 100000), // 邀请人：好友首次生成后到账
    inviteeBonus: int('growth.inviteeBonus', process.env.TAVERN_INVITEE_BONUS, 100000), // 被邀请人：注册即到账
    inviteMax: int('growth.inviteMax', process.env.TAVERN_INVITE_MAX ?? '50', 100000), // 每人最多拿多少次邀请奖励
  };
}

// 「今天」按北京时间算，零点刷新
function today(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// ─── 每日免费额度 ───

export function dailyFreeRemaining(userId: number): number {
  const { dailyFree } = growthConfig();
  if (!dailyFree) return 0;
  const row = db.prepare('SELECT used FROM daily_free_usage WHERE user_id = ? AND day = ?').get(userId, today()) as { used: number } | undefined;
  return Math.max(0, dailyFree - (row?.used ?? 0));
}

/** 从今日额度里扣掉最多 cost 点，返回实际由免费额度承担的点数。 */
export function consumeDailyFree(userId: number, cost: number): number {
  const amount = Math.min(Math.max(0, Math.round(cost)), dailyFreeRemaining(userId));
  if (!amount) return 0;
  db.prepare(`
    INSERT INTO daily_free_usage (user_id, day, used) VALUES (?,?,?)
    ON CONFLICT(user_id, day) DO UPDATE SET used = used + excluded.used
  `).run(userId, today(), amount);
  return amount;
}

// ─── 首充赠送 ───

export function firstTopupEligible(userId: number): boolean {
  if (!growthConfig().firstTopupPct) return false;
  return !db.prepare("SELECT 1 FROM orders WHERE user_id = ? AND status IN ('paid', 'refunded') LIMIT 1").get(userId);
}

/** 订单确认到账后调用（已在 markOrderPaid 的事务里）：只对第一笔到账订单生效。 */
export function grantFirstTopupBonus(userId: number, orderId: number, points: number): number {
  const pct = growthConfig().firstTopupPct;
  if (!pct) return 0;
  const paid = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE user_id = ? AND status IN ('paid', 'refunded')").get(userId) as { n: number };
  if (paid.n !== 1) return 0;
  const bonus = Math.floor((points * pct) / 100);
  if (bonus <= 0) return 0;
  grantPoints(userId, bonus, `首充赠送 ${pct}% · 订单 #${orderId}`, 'bonus');
  return bonus;
}

// ─── 邀请好友 ───

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function referralCode(userId: number): string {
  const row = db.prepare('SELECT code FROM referral_codes WHERE user_id = ?').get(userId) as { code: string } | undefined;
  if (row) return row.code;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `R-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
    const done = db.prepare('INSERT OR IGNORE INTO referral_codes (user_id, code, created_at) VALUES (?,?,?)').run(userId, code, Date.now());
    if (Number(done.changes) > 0) return code;
  }
  throw new Error('无法生成邀请码');
}

export function isReferralCode(code: string): boolean {
  return /^R-[A-Z0-9]{6}$/.test(code.trim().toUpperCase());
}

export function referrerFor(code: string): number | null {
  if (!isReferralCode(code)) return null;
  const row = db.prepare('SELECT user_id FROM referral_codes WHERE code = ?').get(code.trim().toUpperCase()) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

/** 注册成功后记录邀请关系，并给新用户发见面礼。返回新用户得到的点数。 */
export function recordReferral(inviteeId: number, code: string): number {
  const referrer = referrerFor(code);
  if (!referrer || referrer === inviteeId) return 0;
  const created = db.prepare('INSERT OR IGNORE INTO referrals (invitee_id, referrer_id, created_at) VALUES (?,?,?)').run(inviteeId, referrer, Date.now());
  if (!Number(created.changes)) return 0;
  const { inviteeBonus } = growthConfig();
  if (inviteeBonus) grantPoints(inviteeId, inviteeBonus, '好友邀请见面礼', 'bonus');
  return inviteeBonus;
}

/** 被邀请人第一次成功生成后，给邀请人发奖励（只发一次；超过上限不再发）。 */
export function rewardReferrerOnFirstUse(inviteeId: number): void {
  const row = db.prepare('SELECT referrer_id, rewarded_at FROM referrals WHERE invitee_id = ?').get(inviteeId) as { referrer_id: number; rewarded_at: number | null } | undefined;
  if (!row || row.rewarded_at) return;
  const { inviteReward, inviteMax } = growthConfig();
  transaction(() => {
    const claimed = db.prepare('UPDATE referrals SET rewarded_at = ? WHERE invitee_id = ? AND rewarded_at IS NULL').run(Date.now(), inviteeId);
    if (!Number(claimed.changes) || !inviteReward) return;
    const count = db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND rewarded_at IS NOT NULL').get(row.referrer_id) as { n: number };
    if (count.n > inviteMax) return;
    grantPoints(row.referrer_id, inviteReward, '邀请好友奖励', 'bonus');
    notify(row.referrer_id, { type: 'points', title: `邀请奖励 +${inviteReward} 点`, body: '你邀请的好友开始了第一段故事。', link: '/me/points' });
  });
}

export function referralStats(userId: number) {
  const row = db.prepare('SELECT COUNT(*) AS joined, COUNT(rewarded_at) AS active FROM referrals WHERE referrer_id = ?').get(userId) as { joined: number; active: number };
  return { joined: row.joined, active: row.active };
}
