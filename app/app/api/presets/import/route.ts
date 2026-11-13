import { fail, json, requireUser } from '@/lib/api';
import { createPreset } from '@/lib/resources-db';
import { parseStPreset } from '@/lib/resources';

export const dynamic = 'force-dynamic';

// POST /api/presets/import —— 粘贴 SillyTavern 预设 JSON（也接受对象）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { json?: unknown };
  let raw: unknown = body.json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return fail('JSON 解析失败，请检查粘贴内容', 400);
    }
  }
  const imported = parseStPreset(raw);
  if (!imported) return fail('这不是可识别的预设 JSON', 400);
  const preset = createPreset(user.id, imported);
  return json({ preset }, 201);
}
