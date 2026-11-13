import { fail, idParam, json, requireUser } from '@/lib/api';
import { restoreBackup } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; backupId: string }> };

// POST /api/chats/[id]/backups/[backupId]/restore —— 恢复到某份快照（恢复前会先留一份当前状态）
export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const params = await context.params;
  const id = idParam(params.id);
  const backupId = idParam(params.backupId);
  if (!id || !backupId) return fail('参数不对', 400);
  return restoreBackup(id, user.id, backupId) ? json({ ok: true }) : fail('快照不存在', 404);
}
