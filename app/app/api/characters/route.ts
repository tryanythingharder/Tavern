import { flattenText, moderateText } from '@/lib/auto-moderation';
import { fail, json, requireUser } from '@/lib/api';
import { createCharacter } from '@/lib/characters';
import { logActivity } from '@/lib/audit';
import { canGenerate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/characters —— 创建自己的角色
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.status !== 'draft' && !canGenerate(user)) return fail('请先验证邮箱后再发布作品', 403);
  const verdict = await moderateText(flattenText(body));
  if (!verdict.ok) return fail(verdict.message, 422);
  const character = createCharacter(user.id, user.nickname, body);
  if (!character) return fail('草稿只需角色名；发布还需要剧情钩子和开场白', 400);
  logActivity({ actorId: user.id, action: body.status === 'draft' ? 'character.draft' : 'character.publish', targetType: 'character', targetId: character.id, detail: { status: character.status } });
  return json({ character }, 201);
}
