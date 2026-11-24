import { reportError } from '@/lib/monitor';
import { rateLimit, ipFromRequest } from '@/lib/rate-limit';
import { jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/client-error —— 浏览器端未捕获错误上报（每个 IP 每分钟最多 20 条）
export async function POST(request: Request) {
  const limit = rateLimit('client-error', [ipFromRequest(request)], 20, 60 * 1000);
  if (!limit.ok) return new Response(null, { status: 204 });
  // 公开接口：先限请求体（上报内容本来就截到 1000/6000 字），免得匿名请求塞几百 MB 进内存
  const parsed = await jsonOr413(request, 64 * 1024, {});
  if (parsed instanceof Response) return parsed;
  const body = (parsed ?? {}) as { message?: unknown; stack?: unknown; path?: unknown };
  const message = String(body.message ?? '').slice(0, 1000);
  if (!message) return new Response(null, { status: 204 });
  reportError({ source: 'client', message, stack: typeof body.stack === 'string' ? body.stack : undefined, path: String(body.path ?? '').slice(0, 200) });
  return new Response(null, { status: 204 });
}
