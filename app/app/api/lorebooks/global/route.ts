import { fail, json, requireUser } from '@/lib/api';
import { globalLorebookIds, setGlobalLorebookIds } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

// GET/PUT /api/lorebooks/global —— 全局世界书（ST：World Info 面板里选中的书，对所有聊天生效）
//   { ids: number[] | null }  null = 全部（默认），[] = 一本都不用
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ ids: globalLorebookIds(user.id) });
}

export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = body.ids === null ? null : Array.isArray(body.ids) ? body.ids.map(Number).filter((value) => Number.isInteger(value)) : undefined;
  if (ids === undefined) return fail('参数不对', 400);
  setGlobalLorebookIds(user.id, ids);
  return json({ ok: true, ids: globalLorebookIds(user.id) });
}
