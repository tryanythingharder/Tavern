import { fail, idParam, json, requireUser } from '@/lib/api';
import { restoreVersion } from '@/lib/characters';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; versionId: string }> };

export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const params = await context.params;
  const versionId = idParam(params.versionId);
  if (!versionId) return fail('参数不对', 400);
  const character = restoreVersion(user.id, params.id, versionId);
  return character ? json({ character }) : fail('版本不存在', 404);
}
