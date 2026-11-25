import { fail, json, requireUser } from '@/lib/api';
import { createLorebook } from '@/lib/resources-db';
import { parseStWorldInfo } from '@/lib/resources';
import { IMPORT_JSON_LIMIT, jsonOr413, parseJsonText } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/lorebooks/import —— 粘贴 SillyTavern 世界书 JSON（entries 对象或数组）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsed = await jsonOr413(request, IMPORT_JSON_LIMIT, {});
  if (parsed instanceof Response) return parsed;
  const body = parsed as { json?: unknown };
  let raw: unknown = body.json;
  if (typeof raw === 'string') {
    try {
      raw = parseJsonText(raw);
    } catch {
      return fail('JSON 解析失败，请检查粘贴内容', 400);
    }
  }
  const imported = parseStWorldInfo(raw);
  if (!imported) return fail('这不是可识别的世界书 JSON', 400);
  const lorebook = createLorebook(user.id, imported.name, imported.entries);
  return json({ lorebook }, 201);
}
