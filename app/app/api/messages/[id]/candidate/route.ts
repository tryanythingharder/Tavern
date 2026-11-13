import { getCurrentUser } from '@/lib/auth';
import { getOwnedMessage, selectCandidate } from '@/lib/db';

export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json' } });
}

// POST /api/messages/[id]/candidate —— 切换候选（0 起的下标）
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail('未登录', 401);

  const { id } = await context.params;
  const message = getOwnedMessage(Number(id), user.id);
  if (!message) return fail('消息不存在', 404);

  const body = (await request.json().catch(() => ({}))) as { index?: number };
  const selected = selectCandidate(message.id, Number(body.index));
  if (!selected) return fail('候选不存在', 400);

  return Response.json(selected);
}
