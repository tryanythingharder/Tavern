import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { fetchUpstreamModels, getChannel } from '@/lib/channels';
import { imageConfig, ttsConfig } from '@/lib/media';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/admin/channels/models —— 拉取上游 /models
// body: { baseUrl?, apiKey?, channelId?, kind? }
// - channelId：用渠道已保存的密钥
// - kind=image|tts：用接口配置里已保存的地址/密钥兜底
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as {
    baseUrl?: string;
    apiKey?: string;
    channelId?: number;
    kind?: string;
  };
  const stored = body.channelId ? getChannel(Number(body.channelId)) : null;
  const gateway = body.kind === 'image' ? imageConfig() : body.kind === 'tts' ? ttsConfig() : null;
  const baseUrl = String(body.baseUrl ?? stored?.baseUrl ?? gateway?.baseUrl ?? '').trim();
  const apiKey = String(body.apiKey ?? '').trim() || stored?.apiKey || gateway?.apiKey || '';
  if (!baseUrl) return fail('请先填写 Base URL', 400);
  if (!apiKey) return fail('请先填写 API Key', 400);
  try {
    const models = await fetchUpstreamModels(baseUrl, apiKey);
    if (!models.length) return fail('上游没有返回任何模型', 502);
    return json({ models });
  } catch (error) {
    return fail(error instanceof Error ? error.message : '获取模型失败', 502);
  }
}
