import { fail, json, requireUser } from '@/lib/api';
import { addComment, listComments } from '@/lib/characters';
import { getCharacterView } from '@/lib/characters';
import { canGenerate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const { id } = await context.params;
  if (!getCharacterView(id)) return fail('角色不存在', 404);
  return json({ comments: listComments(id) });
}

// POST /api/characters/[id]/comments —— { content }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再评论', 403);
  const { id } = await context.params;
  if (!getCharacterView(id)) return fail('角色不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const comment = addComment(id, user.id, String(body.content ?? ''));
  if (!comment) return fail('评论不能为空', 400);
  return json({ comment }, 201);
}
