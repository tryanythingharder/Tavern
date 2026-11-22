import { fail, json, requireUser } from '@/lib/api';
import { importStPersonas, listPersonas } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

// POST /api/personas/import —— SillyTavern「身份管理 → 备份」导出的 JSON
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = await request.json().catch(() => null);
  if (!body) return fail('文件不是有效的 JSON', 400);
  try {
    const result = importStPersonas(user.id, body);
    return json({ ...result, personas: listPersonas(user.id) });
  } catch (error) {
    return fail((error as Error).message, 400);
  }
}
