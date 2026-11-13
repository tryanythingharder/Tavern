import { fail, json, requireUser } from '@/lib/api';
import { getCharacterView, toggleAdded } from '@/lib/characters';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/characters/[id]/added —— { added }
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  if (!getCharacterView(id)) return fail('角色不存在', 404);
  const body = (await request.json().catch(() => ({}))) as { added?: boolean };
  const added = toggleAdded(user.id, id, body.added === true);
  return json({ added });
}
