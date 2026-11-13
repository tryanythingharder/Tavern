import { fail, json, requireUser } from '@/lib/api';
import { listVersions } from '@/lib/characters';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const { id } = await context.params;
  return json({ versions: listVersions(id, user.id) });
}
