import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { createChannel, listChannels, publicChannel } from '@/lib/channels';
import { readJson } from '@/lib/body-limit';
import { legacyRoutes } from '@/lib/model';

export const dynamic = 'force-dynamic';

// GET /api/admin/channels
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json({ channels: listChannels().map(publicChannel) });
}

// POST /api/admin/channels —— 新建渠道
// legacyRoute: n —— 把旧版「单线路配置」的第 n 条线路（0 = 主线路，之后是备用线路）转成渠道：
// 地址、密钥、模型都取服务端保存的旧配置（密钥不经过浏览器），旧配置本身保留不删。
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as Record<string, unknown>;
  if (body.legacyRoute !== undefined) {
    const index = Number(body.legacyRoute);
    const route = Number.isInteger(index) && index >= 0 ? legacyRoutes()[index] : undefined;
    if (!route) return fail('旧版线路不存在或已不完整', 400);
    Object.assign(body, { baseUrl: route.baseUrl, apiKey: route.apiKey, models: [route.model], defaultModel: route.model });
  }
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
