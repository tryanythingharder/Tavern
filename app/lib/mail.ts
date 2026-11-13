import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSetting } from '@/lib/settings';

// 邮件发送：优先 Resend HTTP API（无需额外依赖），未配置时写到 .data/outbox 便于本地开发查看。
// 配置项：mail.resend_key / mail.from（后台「邮件」或 TAVERN_MAIL_RESEND_KEY / TAVERN_MAIL_FROM）
export type MailResult = { ok: boolean; mode: 'resend' | 'outbox'; error?: string; preview?: string };

export function mailConfigured(): boolean {
  return Boolean(getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? '') && getSetting('mail.from', process.env.TAVERN_MAIL_FROM ?? ''));
}

// 站点根地址：优先 NEXT_PUBLIC_SITE_URL，其次请求来源（反向代理下建议显式配置）
export function siteUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (request) return new URL(request.url).origin;
  return 'http://localhost:3100';
}

export function authLink(path: '/reset' | '/verify' | '/verify-email', token: string, request?: Request): string {
  return `${siteUrl(request)}${path}?token=${encodeURIComponent(token)}`;
}

export async function sendMail(input: { to: string; subject: string; text: string }): Promise<MailResult> {
  const key = getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? '');
  const from = getSetting('mail.from', process.env.TAVERN_MAIL_FROM ?? '');

  if (key && from) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { ok: false, mode: 'resend', error: `邮件服务返回 ${response.status}${detail ? `：${detail.slice(0, 160)}` : ''}` };
      }
      return { ok: true, mode: 'resend' };
    } catch (error) {
      return { ok: false, mode: 'resend', error: error instanceof Error ? error.message : '邮件发送失败' };
    }
  }

  // 开发兜底：不真的发信，把内容落到本地 outbox（文件名就是预览路径）
  const dir = join(process.cwd(), '.data', 'outbox');
  mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.json`;
  writeFileSync(join(dir, name), JSON.stringify({ ...input, createdAt: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, mode: 'outbox', preview: `.data/outbox/${name}` };
}
