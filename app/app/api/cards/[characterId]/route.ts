import { fail, json, requireUser } from '@/lib/api';
import { deleteOverride, saveOverride } from '@/lib/cards';
import { getCharacterById } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ characterId: string }> };

// PUT /api/cards/[characterId] —— 保存这个角色的卡内提示词覆盖
export async function PUT(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { characterId } = await context.params;
  if (!getCharacterById(characterId)) return fail('角色不存在', 404);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const override = saveOverride(user.id, characterId, body);
  return json({ override });
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { characterId } = await context.params;
  return deleteOverride(user.id, characterId) ? json({ ok: true }) : fail('没有覆盖', 404);
}
