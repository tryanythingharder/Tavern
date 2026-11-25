import { fail, idParam, json, requireUser } from '@/lib/api';
import { toStSet } from '@/lib/quick-replies';
import { deleteQrSet, getQrSet, listQrSets, qrState, updateQrSet, type QrSetInput } from '@/lib/quick-replies-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET ?format=st 导出成 SillyTavern 能导入的 JSON
export async function GET(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  const set = id ? getQrSet(user.id, id) : null;
  if (!set) return fail('快捷回复集不存在', 404);
  if (new URL(request.url).searchParams.get('format') !== 'st') return json({ set });
  const names = new Map(listQrSets(user.id).map((item) => [item.id, item.name]));
  const body = JSON.stringify(toStSet(set, (setId) => names.get(setId) ?? null), null, 4);
  const file = `${set.name.replace(/[\\/:*?"<>|]+/g, '_') || 'quick-replies'}.json`;
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file)}` },
  });
}

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as QrSetInput;
  const set = updateQrSet(user.id, id, body);
  return set ? json({ set, ...qrState(user.id) }) : fail('快捷回复集不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deleteQrSet(user.id, id) ? json({ ok: true, ...qrState(user.id) }) : fail('快捷回复集不存在', 404);
}
