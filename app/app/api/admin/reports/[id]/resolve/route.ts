import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { resolveReport } from '@/lib/moderation';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/reports/[id]/resolve —— { action: 'resolved' | 'dismissed' }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { action?: string };
  const action = body.action === 'dismissed' ? 'dismissed' : 'resolved';
  return resolveReport(user.id, id, action) ? json({ ok: true }) : fail('举报不存在或已处理', 400);
}
