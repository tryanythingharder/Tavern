import { fail, idParam, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { readJson } from '@/lib/body-limit';
import { getChannel, recordChannelTest } from '@/lib/channels';
import { ModelTestError, testModelRoute } from '@/lib/model';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// 单次测试的超时：比生成的上游超时短，批量测试时一条卡住不会拖太久
function testTimeoutMs(): number {
  const value = Number(process.env.TAVERN_CHANNEL_TEST_TIMEOUT_MS ?? 30_000);
  return Math.min(120_000, Math.max(3000, Number.isFinite(value) ? value : 30_000));
}

// POST /api/admin/channels/[id]/test —— 只测这一条渠道，不走 failover
// body（可选）：{ model?: 要测的模型，默认渠道的默认模型；prompt?: 测试内容，默认一句简短提示 }
// 直连上游发一次非流式请求：不走 streamChat、不计费、不写点数账本。
// 结果写回渠道的「上次测试」记录（测的不是默认模型时备注里带上模型名）；客户端中途取消的不记。
export async function POST(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const parsed = await readJson(request, {});
  if (parsed instanceof Response) return parsed;
  const body = (parsed && typeof parsed === 'object' ? parsed : {}) as { model?: unknown; prompt?: unknown };
  const channel = getChannel(id);
  if (!channel) return fail('渠道不存在', 404);
  if (!channel.baseUrl || !channel.apiKey) return fail('渠道还没配置 Base URL / API Key', 400);
  const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : channel.defaultModel;
  if (!model) return fail('请先获取并选择一个模型', 400);
  if (model.length > 200 || /[\u0000-\u001f]/.test(model)) return fail('模型名不对', 400);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 500) : '';
  const tag = model === channel.defaultModel ? '' : `[${model}] `;
  try {
    const result = await testModelRoute(
      { baseUrl: channel.baseUrl, apiKey: channel.apiKey, model },
      { prompt, timeoutMs: testTimeoutMs(), signal: request.signal },
    );
    const text = result.text || '（模型没有返回正文）';
    const note = `${tag}${text} · ${result.ms}ms`;
    recordChannelTest(id, true, note);
    return json({ ok: true, text, ms: result.ms, model, note });
  } catch (error) {
    const message = error instanceof Error ? error.message : '测试失败';
    const upstreamStatus = error instanceof ModelTestError ? error.status : 0;
    const ms = error instanceof ModelTestError ? error.ms : 0;
    if (!request.signal.aborted) recordChannelTest(id, false, `${tag}${message}`);
    return Response.json({ message, model, upstreamStatus, ms, note: `${tag}${message}` }, { status: 502 });
  }
}
