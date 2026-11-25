import { fail, json, requireUser } from '@/lib/api';
import { createPreset, ensureDefaultPreset, listPresets } from '@/lib/resources-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/presets —— 首次访问时顺手创建默认预设
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  ensureDefaultPreset(user.id);
  return json({ presets: listPresets(user.id) });
}

// POST /api/presets
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  const preset = createPreset(user.id, body);
  return json({ preset }, 201);
}
