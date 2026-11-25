import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { deleteChannel, getChannel, publicChannel, updateChannel } from '@/lib/channels';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PATCH /api/admin/channels/[id] —— 修改渠道；apiKey 留空表示不变
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  try {
    const channel = updateChannel(id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      models: body.models,
      defaultModel: typeof body.defaultModel === 'string' ? body.defaultModel : undefined,
      priority: body.priority === undefined ? undefined : Number(body.priority),
      enabled: body.enabled === undefined ? undefined : Boolean(body.enabled),
      apiMode: typeof body.apiMode === 'string' ? body.apiMode : undefined,
      textTemplate: typeof body.textTemplate === 'string' ? body.textTemplate : undefined,
    });
    if (!channel) return fail('渠道不存在', 404);
    logAdmin(user.id, '修改模型渠道', `${channel.name} · ${channel.baseUrl} · ${channel.enabled ? '启用' : '停用'}`);
    return json({ channel: publicChannel(channel) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存失败', 400);
  }
}

// DELETE /api/admin/channels/[id]
export async function DELETE(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const channel = getChannel(id);
  if (!channel) return fail('渠道不存在', 404);
  deleteChannel(id);
  logAdmin(user.id, '删除模型渠道', `${channel.name} · ${channel.baseUrl}`);
  return json({ ok: true });
}
