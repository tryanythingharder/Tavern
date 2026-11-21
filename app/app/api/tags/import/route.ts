import { fail, json, requireUser } from '@/lib/api';
import { importCardTags, importStTags, listTags, tagMap } from '@/lib/char-tags';
import { libraryCharacters, libraryNames } from '@/lib/library';

export const dynamic = 'force-dynamic';

// POST /api/tags/import
//   { source: 'card', characterIds? }  把卡片自带标签变成自己的标签（不传 characterIds = 整个角色库）
//   { source: 'st', data: { tags, tag_map } }  导入 ST 的标签（settings.json 或标签备份）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { source?: string; characterIds?: unknown; data?: unknown };
  let result: { created: number; linked: number };
  if (body.source === 'st') {
    const data = (body.data && typeof body.data === 'object' ? body.data : {}) as { tags?: unknown; tag_map?: unknown };
    if (!Array.isArray(data.tags)) return fail('文件里没有 tags（需要 ST 的 settings.json 或标签备份）', 400);
    result = importStTags(user.id, data, libraryNames(user.id));
  } else {
    const wanted = Array.isArray(body.characterIds) ? new Set(body.characterIds.map(String)) : null;
    const cards = libraryCharacters(user.id).filter((c) => !wanted || wanted.has(c.id));
    result = importCardTags(user.id, cards.map((c) => ({ id: c.id, tags: c.tags })));
  }
  return json({ ...result, tags: listTags(user.id), map: tagMap(user.id) });
}
