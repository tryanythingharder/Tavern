import { fail, idParam, json, requireUser } from '@/lib/api';
import { deletePreset, getPreset, updatePreset } from '@/lib/resources-db';
import { toStPreset } from '@/lib/resources';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const preset = getPreset(user.id, id);
  if (!preset) return fail('预设不存在', 404);
  // ?format=st：下载成 ST 聊天补全预设 JSON
  if (new URL(request.url).searchParams.get('format') === 'st') {
    const { id: _id, ...rest } = preset;
    return new Response(JSON.stringify(toStPreset(rest), null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(preset.name || 'preset')}.json`,
      },
    });
  }
  return json({ preset });
}

export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  const preset = updatePreset(user.id, id, body);
  return preset ? json({ preset }) : fail('预设不存在', 404);
}

export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  return deletePreset(user.id, id) ? json({ ok: true }) : fail('预设不存在', 404);
}
