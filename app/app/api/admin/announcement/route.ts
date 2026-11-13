import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { announcementSetting } from '@/lib/announcement';
import { setSetting } from '@/lib/settings';
import { logAdmin } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/admin/announcement
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json({ text: announcementSetting() });
}

// PATCH /api/admin/announcement —— { text }，空字符串表示关闭公告
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = String(body.text ?? '').trim().slice(0, 200);
  if (text) setSetting('site.announcement', text);
  else setSetting('site.announcement', 'off');
  logAdmin(user.id, text ? '更新公告' : '关闭公告', text.slice(0, 80));
  return json({ ok: true, text });
}
