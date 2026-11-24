import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ACTION_GROUPS, ACTION_LABELS, countActivity, listActivity, parseFilter, retentionDays, type FilterParams } from '@/lib/audit';
import { AdminAudit, type ActionGroup } from '@/components/admin-audit';
import { TZ_COOKIE } from '@/lib/tz';

export const dynamic = 'force-dynamic';

const PER_PAGE = 30;

const GROUPS: ActionGroup[] = ACTION_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  actions: Object.entries(ACTION_LABELS)
    .filter(([code]) => group.prefixes.some((prefix) => code.startsWith(prefix)))
    .map(([code, label]) => ({ code, label })),
}));

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<FilterParams & { page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const params = await searchParams;
  const pick = (v: unknown) => (typeof v === 'string' ? v : '');
  const raw = { scope: pick(params.scope), user: pick(params.user), action: pick(params.action), from: pick(params.from), to: pick(params.to), ip: pick(params.ip) };
  const filter = parseFilter(raw, (await cookies()).get(TZ_COOKIE)?.value);
  const total = countActivity(filter);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(pages, Math.max(1, Math.floor(Number(params.page) || 1)));
  const entries = listActivity(filter, PER_PAGE, (current - 1) * PER_PAGE);

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>审计日志</h1>
          <div className="p-atoolbar-sub">{`用户登录、发布、充值与管理员赠点、封禁、配置修改等操作留痕，保留 ${retentionDays()} 天`}</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminAudit
          entries={entries}
          total={total}
          page={current}
          pages={pages}
          current={{ ...raw, scope: filter.scope ?? 'all' }}
          groups={GROUPS}
        />
      </div>
    </>
  );
}
