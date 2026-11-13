import { fail, json, requireUser } from '@/lib/api';
import { listOverrides } from '@/lib/cards';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ overrides: listOverrides(user.id) });
}
