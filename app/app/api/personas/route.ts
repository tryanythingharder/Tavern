import { fail, json, requireUser } from '@/lib/api';
import { createPersona, listPersonas } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ personas: listPersonas(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!String(body.name ?? '').trim()) return fail('身份名不能为空', 400);
  const persona = createPersona(user.id, body);
  return json({ persona }, 201);
}
