import { getCurrentUser } from '@/lib/auth';
import { branchChat, chatBranches, getChat } from '@/lib/db';
import { busyGuard } from '@/lib/gen-lock';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// GET /api/chats/[id]/branch —— 分支关系（来源 + 从这里分出的分支/检查点）
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  return Response.json(chatBranches(Number(id), user.id));
}

// POST /api/chats/[id]/branch —— 从某条消息分支出一个新会话（原会话不动）
// { messageId, checkpoint?: true, name? }：checkpoint 对应 ST 的「创建检查点」，留在原会话，消息上记下检查点
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { messageId?: number; checkpoint?: boolean; name?: string };
  const messageId = Number(body.messageId);
  if (!Number.isInteger(messageId)) return fail('缺少消息', 400);

  // 先确认会话归属再看是否在生成，不给别人的会话 id 透露活动状态
  if (!getChat(Number(id), user.id)) return fail('无法从这个位置分支', 400);
  const busy = busyGuard(`chat:${Number(id)}`);
  if (busy) return busy;
  const chat = branchChat(Number(id), user.id, messageId, { checkpoint: body.checkpoint === true, name: typeof body.name === 'string' ? body.name : undefined });
  if (!chat) return fail('无法从这个位置分支', 400);

  return Response.json({ chatId: chat.id, title: chat.title });
}
