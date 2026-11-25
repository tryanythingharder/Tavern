import { mkdirSync } from 'fs';
import { join } from 'path';
import { serviceValue } from '@/lib/service-config';
import { appendRotating, errorLogRotation } from '@/lib/log-rotate';

// 轻量监控：错误写 .data/logs/errors.log（JSON Lines，按大小轮转：默认单文件 10MB、保留 errors.log.1–.5，见 lib/log-rotate.ts），可选推送到告警 webhook
// （TAVERN_ALERT_WEBHOOK，飞书/钉钉/Slack/Discord 的「接收 JSON」机器人都行）。
// 同类错误 5 分钟内只推一次，避免刷屏。
const logDir = join(process.cwd(), '.data', 'logs');
const recent = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

// 告警地址：后台「站点与服务」> TAVERN_ALERT_WEBHOOK；数据库读不了时退回环境变量
function alertWebhook(): string {
  try { return serviceValue('alert.webhook'); } catch { return process.env.TAVERN_ALERT_WEBHOOK?.trim() ?? ''; }
}

export function sendAlert(text: string): Promise<boolean> {
  const hook = alertWebhook();
  if (!hook) return Promise.resolve(false);
  return fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 兼容多家机器人：text / content / msg_type+content
    body: JSON.stringify({ text, content: text, msg_type: 'text', msgtype: 'text', markdown: undefined }),
    signal: AbortSignal.timeout(4000),
  }).then((res) => res.ok).catch(() => false);
}

export type ErrorReport = { source: 'server' | 'client'; message: string; stack?: string; path?: string; digest?: string; extra?: Record<string, unknown> };

export function reportError(report: ErrorReport): void {
  const entry = { at: new Date().toISOString(), ...report, message: String(report.message).slice(0, 2000), stack: report.stack?.slice(0, 6000) };
  try {
    mkdirSync(logDir, { recursive: true });
    appendRotating(join(logDir, 'errors.log'), JSON.stringify(entry) + '\n', errorLogRotation());
  } catch {
    // 只读文件系统时退回到 stderr
  }
  console.error('[tavern:error]', entry.source, entry.path ?? '', entry.message);

  const hook = alertWebhook();
  if (!hook) return;
  const key = `${report.source}|${report.path ?? ''}|${entry.message.slice(0, 120)}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - THROTTLE_MS) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  const text = `【夜话告警】${report.source === 'client' ? '前端' : '服务端'}错误\n${report.path ?? ''}\n${entry.message}`;
  void sendAlert(text);
}
