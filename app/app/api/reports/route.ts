import { fail, json, requireUser } from '@/lib/api';
import { createReport } from '@/lib/moderation';
import { logActivity } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// POST /api/reports —— { targetType, targetId, reason, note }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { targetType?: string; targetId?: string; reason?: string; note?: string };
  const targetId = String(body.targetId ?? '').trim();
  if (!targetId) return fail('缺少举报对象', 400);
  const id = createReport(user.id, String(body.targetType ?? 'other'), targetId, String(body.reason ?? '其他'), String(body.note ?? ''));
  logActivity({ actorId: user.id, action: 'report.create', targetType: String(body.targetType ?? 'other'), targetId, detail: { reportId: id, reason: String(body.reason ?? '其他') } });
  return json({ ok: true, id }, 201);
}
