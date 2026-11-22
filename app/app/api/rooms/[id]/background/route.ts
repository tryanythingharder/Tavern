import { fail, json, requireUser } from '@/lib/api';
import { ownsBackground, resolveBackground, setThreadBackground } from '@/lib/backgrounds';

import { getRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

// GET —— 当前生效的背景（斜杠命令 /bg 用）
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = Number((await context.params).id);
  if (!getRoom(id, user.id)) return fail('不存在', 404);
  return json(resolveBackground('room', id, user.id));
}

// PUT { value } —— null 跟随默认，'' 这段不要背景，其它为背景库里的图片地址
export async function PUT(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = Number((await context.params).id);
  const body = (await request.json().catch(() => ({}))) as { value?: string | null };
  const value = body.value === undefined ? null : body.value;
  if (value && !ownsBackground(user.id, value)) return fail('背景不在你的背景库里');
  if (!setThreadBackground('room', id, user.id, value)) return fail('不存在', 404);
  return json(resolveBackground('room', id, user.id));
}
