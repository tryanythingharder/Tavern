import { fail, json, requireUser } from '@/lib/api';
import { createRegexRule, listRegexRules } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ rules: listRegexRules(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(body.find ?? '').trim()) return fail('查找内容不能为空', 400);
  const rule = createRegexRule(user.id, body);
  return json({ rule }, 201);
}
