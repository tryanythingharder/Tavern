import { fail, json, requireUser } from '@/lib/api';
import { createRegexRule } from '@/lib/resources-db';
import { parseStRegex } from '@/lib/resources';
import { IMPORT_JSON_LIMIT, jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/regex/import —— 粘贴 SillyTavern 正则扩展导出（regex_scripts 数组或数组本身）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsed = await jsonOr413(request, IMPORT_JSON_LIMIT, {});
  if (parsed instanceof Response) return parsed;
  const body = parsed as { json?: unknown };
  let raw: unknown = body.json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return fail('JSON 解析失败，请检查粘贴内容', 400);
    }
  }
  const imported = parseStRegex(raw);
  if (!imported || !imported.length) return fail('没有找到可导入的正则规则', 400);
  const rules = imported.slice(0, 100).map((rule) => createRegexRule(user.id, rule));
  return json({ rules, count: rules.length }, 201);
}
