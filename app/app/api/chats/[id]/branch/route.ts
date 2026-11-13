import { getCurrentUser } from '@/lib/auth';
import { branchChat } from '@/lib/db';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/chats/[id]/branch —— 从某条消息分支出一个新会话（原会话不动）
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { messageId?: number };
  const messageId = Number(body.messageId);
  if (!Number.isInteger(messageId)) return fail('缺少消息', 400);

  const chat = branchChat(Number(id), user.id, messageId);
  if (!chat) return fail('无法从这个位置分支', 400);

  return Response.json({ chatId: chat.id, title: chat.title });
}
