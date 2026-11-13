import { getCurrentUser } from '@/lib/auth';
import { deleteMessage, getMessage, getOwnedMessage, updateMessageContent } from '@/lib/db';
import { setBookmark, snapshotChat } from '@/lib/memory';
import { toMessageView } from '@/lib/chat-view';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// PATCH /api/messages/[id] —— 编辑消息（角色消息只改当前选中的候选）
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);

  const { id } = await context.params;
  const message = getOwnedMessage(Number(id), user.id);
  if (!message) return fail('消息不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { content?: string; bookmark?: boolean };

  // 书签只改标记，不动正文
  if (typeof body.bookmark === 'boolean') {
    if (!setBookmark(message.id, body.bookmark)) return fail('保存失败', 400);
    const updated = getMessage(message.id);
    return updated ? Response.json({ message: toMessageView(updated) }) : fail('消息不存在', 404);
  }

  const content = String(body.content ?? '').trim();
  if (!content) return fail('内容不能为空', 400);

  const updated = updateMessageContent(message.id, content);
  if (!updated) return fail('消息不存在', 404);
  return Response.json({ message: toMessageView(updated) });
}

// DELETE /api/messages/[id]
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);

  const { id } = await context.params;
  const message = getOwnedMessage(Number(id), user.id);
  if (!message) return fail('消息不存在', 404);

  snapshotChat(message.chat_id, user.id, true); // 删除前留一份，便于回退
  deleteMessage(message.id);
  return Response.json({ ok: true });
}
