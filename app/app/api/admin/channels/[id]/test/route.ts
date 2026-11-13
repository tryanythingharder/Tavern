import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { getChannel, recordChannelTest } from '@/lib/channels';
import { testModelRoute } from '@/lib/model';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/channels/[id]/test —— 只测这一条渠道，不走 failover
export async function POST(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const channel = getChannel(id);
  if (!channel) return fail('渠道不存在', 404);
  if (!channel.baseUrl || !channel.apiKey) return fail('渠道还没配置 Base URL / API Key', 400);
  if (!channel.defaultModel) return fail('请先获取并选择一个模型', 400);
  try {
    const result = await testModelRoute({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, model: channel.defaultModel });
    const text = result.text || '（模型没有返回正文）';
    recordChannelTest(id, true, `${text} · ${result.ms}ms`);
    return json({ ok: true, text, ms: result.ms });
  } catch (error) {
    const message = error instanceof Error ? error.message : '测试失败';
    recordChannelTest(id, false, message);
    return fail(message, 502);
  }
}
