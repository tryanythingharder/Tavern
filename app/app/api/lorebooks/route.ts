import { fail, json, requireUser } from '@/lib/api';
import { createLorebook, listLorebooks } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ lorebooks: listLorebooks(user.id) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { name?: string; entries?: unknown };
  const lorebook = createLorebook(user.id, body.name ?? '', body.entries ?? []);
  return json({ lorebook }, 201);
}
