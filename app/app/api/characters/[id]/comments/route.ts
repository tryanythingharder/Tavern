import { fail, json, requireUser } from '@/lib/api';
import { addComment, listComments } from '@/lib/characters';
import { getCharacterView } from '@/lib/characters';
import { canGenerate } from '@/lib/auth';
import { readJson } from '@/lib/body-limit';
import { getCurrentUser } from '@/lib/auth';
import { nsfwBlock } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return fail('角色不存在', 404);
  // 18+ 卡：不能看的人也读不到评论（详情页对他们只给名字）
  const blocked18 = await nsfwBlock((await getCurrentUser())?.id ?? null, character);
  if (blocked18) return fail(blocked18, 403);
  return json({ comments: listComments(id) });
}

// POST /api/characters/[id]/comments —— { content }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!canGenerate(user)) return fail('请先验证邮箱后再评论', 403);
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return fail('角色不存在', 404);
  const blocked18 = await nsfwBlock(user.id, character);
  if (blocked18) return fail(blocked18, 403);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { content?: string };
  const comment = addComment(id, user.id, String(body.content ?? ''));
  if (!comment) return fail('评论不能为空', 400);
  return json({ comment }, 201);
}
