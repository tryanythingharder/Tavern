import { getCurrentUser } from '@/lib/auth';
import { getChat, getMessage, setCharacterLook } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function fail(message: string, status: number) {
  return Response.json({ message }, { status });
}

// PUT /api/chats/[id]/look { messageId } —— 把这段对话里的一张插图设为这个角色的定妆照（以后生图都照它的长相画）
// DELETE —— 取消定妆照，回到角色封面 / 对话里第一张立绘
export async function PUT(request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const chat = getChat(Number((await context.params).id), user.id);
  if (!chat) return fail('会话不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { messageId?: number };
  const message = getMessage(Number(body.messageId));
  if (!message || message.chat_id !== chat.id) return fail('消息不存在', 404);
  let url = '';
  try {
    const attachment = JSON.parse(message.attachment ?? 'null') as { kind?: string; url?: string } | null;
    if (attachment?.kind === 'image' && typeof attachment.url === 'string' && /^\/media\/[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(attachment.url)) url = attachment.url;
  } catch { /* 不是插图 */ }
  if (!url) return fail('只有对话里生成的插图能设为定妆照', 400);
  setCharacterLook(user.id, chat.character_id, url);
  return Response.json({ lookUrl: url });
}

export async function DELETE(_request: Request, context: Params) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const chat = getChat(Number((await context.params).id), user.id);
  if (!chat) return fail('会话不存在', 404);
  setCharacterLook(user.id, chat.character_id, null);
  return Response.json({ lookUrl: null });
}
