import { getCurrentUser } from '@/lib/auth';
import { getRoom } from '@/lib/rooms';
import { roomVariables } from '@/lib/mvu-server';

export const dynamic = 'force-dynamic';

// GET /api/rooms/[id]/variables?message=ID —— 群聊这一楼之后的 MVU 变量，给沙盒里的状态栏脚本读
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: '未登录' }, { status: 401 });
  const room = getRoom(Number((await context.params).id), user.id);
  if (!room) return Response.json({ message: '房间不存在' }, { status: 404 });
  const messageId = Number(new URL(request.url).searchParams.get('message')) || undefined;
  return Response.json(roomVariables(room.id, room.characterIds, { uptoId: messageId }), { headers: { 'Cache-Control': 'no-store' } });
}
