import { fail, json, requireUser } from '@/lib/api';
import { createTag, exportStTags, listTags, reorderTags, tagMap } from '@/lib/char-tags';
import { libraryNames } from '@/lib/library';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/tags —— { tags, map }；?format=st 导出 ST 结构（tags + tag_map）
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (new URL(request.url).searchParams.get('format') === 'st') {
    return new Response(JSON.stringify(exportStTags(user.id, libraryNames(user.id)), null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="tags.json"' },
    });
  }
  return json({ tags: listTags(user.id), map: tagMap(user.id) });
}

// POST /api/tags —— { name, color?, folder? } 新建；{ order: number[] } 重排
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { name?: unknown; color?: unknown; folder?: unknown; order?: unknown };
  if (Array.isArray(body.order)) {
    reorderTags(user.id, body.order.map(Number).filter(Number.isFinite));
    return json({ tags: listTags(user.id) });
  }
  const tag = createTag(user.id, body);
  if ('error' in tag) return fail(tag.error, 400);
  return json({ tag });
}
