import { fail, json } from '@/lib/api';
import { findProvider } from '@/lib/age-verify';
import { markAgeVerified } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

// 年龄验证服务回调：插件验签解析，这里统一标记
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = findProvider(id);
  if (!provider || !provider.configured()) return fail('未知的验证服务', 404);
  const result = await provider.parseCallback(request);
  if (result.kind === 'error') return fail(result.message, result.status);
  if (result.kind === 'verified') {
    markAgeVerified(result.userId, provider.id);
  }
  return json({ ok: true });
}
