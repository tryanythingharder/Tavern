import { getCurrentUser } from '@/lib/auth';
import { getChat } from '@/lib/db';
import { chatVariables } from '@/lib/mvu-server';

export const dynamic = 'force-dynamic';

// GET /api/chats/[id]/variables?message=ID —— 这一楼之后的 MVU 变量，给沙盒里的状态栏脚本读（components/html-frame.tsx）
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: '未登录' }, { status: 401 });
  const { id } = await context.params;
  const chat = getChat(Number(id), user.id);
  if (!chat) return Response.json({ message: '会话不存在' }, { status: 404 });
  const messageId = Number(new URL(request.url).searchParams.get('message')) || undefined;
  const state = chatVariables(chat.id, chat.character_id, { uptoId: messageId });
  return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
}
