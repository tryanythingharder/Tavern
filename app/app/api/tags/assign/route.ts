import { fail, json, requireUser } from '@/lib/api';
import { assignTags, tagMap } from '@/lib/char-tags';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/tags/assign —— { characterIds: string[], add?: number[], remove?: number[] }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { characterIds?: unknown; add?: unknown; remove?: unknown };
  const ids = Array.isArray(body.characterIds) ? body.characterIds.map(String) : [];
  if (!ids.length) return fail('没有选择角色', 400);
  const nums = (value: unknown) => (Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []);
  assignTags(user.id, ids, nums(body.add), nums(body.remove));
  return json({ map: tagMap(user.id) });
}
