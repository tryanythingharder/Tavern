import { flattenText, moderateText } from '@/lib/auto-moderation';
import { fail, json, requireUser } from '@/lib/api';
import { deleteCharacter, getCharacterView, updateCharacter } from '@/lib/characters';
import { canGenerate } from '@/lib/auth';
import { characterInputLimitError } from '@/lib/card-limits';
import { logActivity } from '@/lib/audit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  if (body.status !== 'draft' && !canGenerate(user)) return fail('请先验证邮箱后再发布作品', 403);
  const limitError = characterInputLimitError(body);
  if (limitError) return fail(limitError, 400);
  const verdict = await moderateText(flattenText(body));
  if (!verdict.ok) return fail(verdict.message, 422);
  const before = getCharacterView(id)?.status;
  const character = updateCharacter(user.id, id, body);
  if (!character) return fail('只能编辑自己的角色，且名称、钩子、开场白不能为空', 404);
  logActivity({ actorId: user.id, action: before === 'draft' && character.status !== 'draft' ? 'character.publish' : 'character.update', targetType: 'character', targetId: id, detail: { status: character.status } });
  return json({ character });
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  if (!getCharacterView(id)) return fail('角色不存在', 404);
  const result = deleteCharacter(user.id, id);
  if (!result) return fail('只能删除自己的角色', 403);
  logActivity({ actorId: user.id, action: 'character.delete', targetType: 'character', targetId: id, detail: { archived: result === 'archived' } });
  return json({ ok: true, archived: result === 'archived' });
}
