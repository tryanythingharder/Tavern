import { fail, json, requireUser } from '@/lib/api';
import { createQuickReply, listQuickReplies } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ replies: listQuickReplies(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { label?: string; content?: string };
  const label = String(body.label ?? '').trim();
  const content = String(body.content ?? '').trim();
  if (!label || !content) return fail('标签和内容都要填', 400);
  const reply = createQuickReply(user.id, label, content);
  return json({ reply }, 201);
}
