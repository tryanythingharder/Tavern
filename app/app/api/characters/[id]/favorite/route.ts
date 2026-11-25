import { fail, json, requireUser } from '@/lib/api';
import { getCharacterView, toggleFavorite } from '@/lib/characters';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/characters/[id]/favorite —— { favorite }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  if (!getCharacterView(id)) return fail('角色不存在', 404);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { favorite?: boolean };
  const favorite = toggleFavorite(user.id, id, body.favorite === true);
  return json({ favorite });
}
