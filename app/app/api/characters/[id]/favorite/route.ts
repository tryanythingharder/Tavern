import { fail, json, requireUser } from '@/lib/api';
import { getCharacterView, toggleFavorite } from '@/lib/characters';
import { readJson } from '@/lib/body-limit';
import { nsfwBlock } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/characters/[id]/favorite —— { favorite }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return fail('角色不存在', 404);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { favorite?: boolean };
  // 18+ 卡：不能看的人不能加进来（移除照常可以）
  const blocked18 = body.favorite === true ? await nsfwBlock(user.id, character) : null;
  if (blocked18) return fail(blocked18, 403);
  const favorite = toggleFavorite(user.id, id, body.favorite === true);
  return json({ favorite });
}
