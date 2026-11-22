import db, { transaction } from '@/lib/db';
import { grantPoints } from '@/lib/points';
import { notify } from '@/lib/notifications';
import { platformToday, shiftDayKey } from '@/lib/tz';

// 每日签到：基础 10 点，连续天数每天 +2（最多 +14）。按平台日算一天（lib/tz.ts）。
const BASE = 10;
const STEP = 2;
const MAX_BONUS_DAYS = 7;

function dayKey(): string {
  return platformToday();
}

function yesterdayKey(): string {
  return shiftDayKey(platformToday(), -1);
}

export type CheckinStatus = { todayDone: boolean; streak: number; amount: number; day: string };

export function checkinStatus(userId: number): CheckinStatus {
  const today = db.prepare('SELECT streak FROM checkins WHERE user_id = ? AND day = ?').get(userId, dayKey()) as { streak: number } | undefined;
  const last = db.prepare('SELECT day, streak FROM checkins WHERE user_id = ? ORDER BY day DESC LIMIT 1').get(userId) as { day: string; streak: number } | undefined;
  if (today) return { todayDone: true, streak: today.streak, amount: 0, day: dayKey() };
  const streak = last && last.day === yesterdayKey() ? last.streak + 1 : 1;
  const amount = BASE + Math.min(streak - 1, MAX_BONUS_DAYS) * STEP;
  return { todayDone: false, streak, amount, day: dayKey() };
}

export function claimCheckin(userId: number): { ok: boolean; message: string; amount?: number; streak?: number; balance?: number } {
  return transaction(() => {
    const status = checkinStatus(userId);
    if (status.todayDone) return { ok: false, message: '今天已经签到过了' };
    const now = Date.now();
    try {
      db.prepare('INSERT INTO checkins (user_id, day, streak, amount, created_at) VALUES (?,?,?,?,?)').run(userId, dayKey(), status.streak, status.amount, now);
    } catch {
      return { ok: false, message: '今天已经签到过了' };
    }
    const balance = grantPoints(userId, status.amount, `签到 · 连续 ${status.streak} 天`, 'checkin');
    notify(userId, { type: 'points', title: `签到 +${status.amount} 点`, body: `连续签到 ${status.streak} 天`, link: '/me/points', push: false });
    return { ok: true, message: '签到成功', amount: status.amount, streak: status.streak, balance };
  });
}
