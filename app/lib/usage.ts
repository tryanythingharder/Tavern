import db, { countGenerationsSince, usageSummary } from '@/lib/db';
import { platformDayStart } from '@/lib/tz';

// 生成配额：先堵住「无限打模型」这件事，再谈定价。
// 两个阈值都走环境变量，默认值保守但够正常聊天用。
export const RATE_PER_MIN = Math.max(1, Number(process.env.TAVERN_RATE_PER_MIN ?? 12));
export const DAILY_TOKEN_CAP = Math.max(0, Number(process.env.TAVERN_DAILY_TOKEN_CAP ?? 200000));
// 全站每日上游预算（0 = 不限制）。这是最后一道止损，防止批量注册把上游打爆。
export const GLOBAL_DAILY_TOKEN_CAP = Math.max(0, Number(process.env.TAVERN_GLOBAL_DAILY_TOKEN_CAP ?? 0));

function globalTokensToday(): number {
  const start = platformDayStart();
  const row = db.prepare(`
        SELECT COALESCE(SUM(total_tokens), 0) AS tokens
        FROM generation_events WHERE created_at >= ? AND status IN ('done','aborted')
    `).get(start) as { tokens: number };
  return row.tokens;
}

export type QuotaCheck = { ok: true } | { ok: false; message: string; retryAfterSeconds?: number };

export function checkQuota(userId: number): QuotaCheck {
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = countGenerationsSince(userId, windowStart);
  if (recent >= RATE_PER_MIN) {
    // 最早那次请求滑出窗口时就能再发，给客户端一个大概的等待时间
    return { ok: false, message: `生成太快了（每分钟最多 ${RATE_PER_MIN} 次），请稍后再试`, retryAfterSeconds: 60 };
  }
  if (DAILY_TOKEN_CAP > 0) {
    const { todayTokens } = usageSummary(userId);
    if (todayTokens >= DAILY_TOKEN_CAP) {
      return { ok: false, message: '今日生成额度已用完，明天再来' };
    }
  }
  if (GLOBAL_DAILY_TOKEN_CAP > 0 && globalTokensToday() >= GLOBAL_DAILY_TOKEN_CAP) {
    return { ok: false, message: '站点今日生成额度已用完，请明天再来' };
  }
  return { ok: true };
}

// 网关没回 usage 时的兜底估算：中文按 1 字 1 token，其他按 4 字符 1 token。
// 只用于记账，不参与计费口径（真实计费以网关 usage 为准）。
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const char of text) {
    if (/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/.test(char)) cjk += 1;
    else other += 1;
  }
  return Math.max(1, Math.ceil(cjk + other / 4));
}

export function estimatePromptTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}
