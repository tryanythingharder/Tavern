import { reportError } from '@/lib/monitor';
import { rateLimit, ipFromRequest } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/client-error —— 浏览器端未捕获错误上报（每个 IP 每分钟最多 20 条）
export async function POST(request: Request) {
  const limit = rateLimit('client-error', [ipFromRequest(request)], 20, 60 * 1000);
  if (!limit.ok) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => ({}))) as { message?: unknown; stack?: unknown; path?: unknown };
  const message = String(body.message ?? '').slice(0, 1000);
  if (!message) return new Response(null, { status: 204 });
  reportError({ source: 'client', message, stack: typeof body.stack === 'string' ? body.stack : undefined, path: String(body.path ?? '').slice(0, 200) });
  return new Response(null, { status: 204 });
}
