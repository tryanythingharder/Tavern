import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat } from '@/lib/db';
import { listBackups, snapshotChat } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/backups —— 最近 5 份快照
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  return json({ backups: listBackups(chat.id, user.id) });
}

// POST /api/chats/[id]/backups —— 手动留一份快照
export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const backupId = snapshotChat(chat.id, user.id, true);
  if (!backupId) return fail('没有可备份的消息', 400);
  return json({ ok: true, backupId }, 201);
}
