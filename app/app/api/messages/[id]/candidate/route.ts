import { getCurrentUser } from '@/lib/auth';
import { getMessage, getOwnedMessage, selectCandidate } from '@/lib/db';
import { reasoningAt } from '@/lib/reasoning';
import { metaAt } from '@/lib/msg-meta';
import { readJson } from '@/lib/body-limit';

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

  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { index?: number };
  const selected = selectCandidate(message.id, Number(body.index));
  if (!selected) return fail('候选不存在', 400);

  // 换版时把这一版的思考内容一起带回去
  const fresh = getMessage(message.id);
  return Response.json({ ...selected, thought: fresh ? reasoningAt(fresh.reasoning, selected.index) : null, meta: fresh ? metaAt(fresh.meta, selected.index) : null });
}
