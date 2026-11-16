import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// 轻量监控：错误写 .data/logs/errors.log（JSON Lines），可选推送到告警 webhook
// （TAVERN_ALERT_WEBHOOK，飞书/钉钉/Slack/Discord 的「接收 JSON」机器人都行）。
// 同类错误 5 分钟内只推一次，避免刷屏。
const logDir = join(process.cwd(), '.data', 'logs');
const recent = new Map<string, number>();
const THROTTLE_MS = 5 * 60 * 1000;

export type ErrorReport = { source: 'server' | 'client'; message: string; stack?: string; path?: string; digest?: string; extra?: Record<string, unknown> };

export function reportError(report: ErrorReport): void {
  const entry = { at: new Date().toISOString(), ...report, message: String(report.message).slice(0, 2000), stack: report.stack?.slice(0, 6000) };
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(join(logDir, 'errors.log'), JSON.stringify(entry) + '\n');
  } catch {
    // 只读文件系统时退回到 stderr
  }
  console.error('[tavern:error]', entry.source, entry.path ?? '', entry.message);

  const hook = process.env.TAVERN_ALERT_WEBHOOK?.trim();
  if (!hook) return;
  const key = `${report.source}|${report.path ?? ''}|${entry.message.slice(0, 120)}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - THROTTLE_MS) return;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  const text = `【酒馆告警】${report.source === 'client' ? '前端' : '服务端'}错误\n${report.path ?? ''}\n${entry.message}`;
  void fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 兼容多家机器人：text / content / msg_type+content
    body: JSON.stringify({ text, content: text, msg_type: 'text', msgtype: 'text', markdown: undefined }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {});
}
