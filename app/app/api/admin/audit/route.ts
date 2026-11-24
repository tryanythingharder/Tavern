import { cookies } from 'next/headers';
import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { activityCsv, countActivity, listActivity, logAdmin, parseFilter } from '@/lib/audit';
import { TZ_COOKIE } from '@/lib/tz';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;
const EXPORT_MAX = 10000;
const CSV_HEADERS = ['time_utc', 'actor_role', 'actor_id', 'actor', 'action', 'action_label', 'target', 'ip', 'user_agent', 'detail'];

// GET /api/admin/audit?scope=&user=&action=&from=&to=&ip=&page= —— 操作日志（仅管理员）
// &format=csv 导出当前筛选结果（最多 1 万条），导出本身记一条 admin.audit.export
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const url = new URL(request.url);
  const q = Object.fromEntries(url.searchParams.entries());
  const filter = parseFilter(q, (await cookies()).get(TZ_COOKIE)?.value);
  const total = countActivity(filter);

  if (q.format === 'csv') {
    const entries = listActivity(filter, EXPORT_MAX, 0);
    const summary = Object.entries({ scope: filter.scope, user: filter.user, action: filter.action, from: q.from, to: q.to, ip: filter.ip })
      .filter(([, v]) => v && v !== 'all').map(([k, v]) => `${k}=${v}`).join(' ');
    logAdmin(user.id, 'admin.audit.export', `${entries.length} 条${summary ? ` · ${summary}` : ''}`, { type: 'audit', id: '' });
    const name = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(activityCsv(entries, CSV_HEADERS), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const page = Math.max(1, Math.floor(Number(q.page) || 1));
  return json({ total, page, perPage: PER_PAGE, entries: listActivity(filter, PER_PAGE, (page - 1) * PER_PAGE) });
}
