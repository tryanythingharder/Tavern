import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { createChannel, listChannels, publicChannel } from '@/lib/channels';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/admin/channels
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json({ channels: listChannels().map(publicChannel) });
}

// POST /api/admin/channels —— 新建渠道
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  try {
    const channel = createChannel({
      name: typeof body.name === 'string' ? body.name : undefined,
      baseUrl: typeof body.baseUrl === 'string' ? body.baseUrl : undefined,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      models: body.models,
      defaultModel: typeof body.defaultModel === 'string' ? body.defaultModel : undefined,
      priority: Number(body.priority ?? 0),
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      apiMode: typeof body.apiMode === 'string' ? body.apiMode : undefined,
      textTemplate: typeof body.textTemplate === 'string' ? body.textTemplate : undefined,
    });
    logAdmin(user.id, '新建模型渠道', `${channel.name} · ${channel.baseUrl} · ${channel.defaultModel || '未选模型'}`);
    return json({ channel: publicChannel(channel) });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '保存失败', 400);
  }
}
