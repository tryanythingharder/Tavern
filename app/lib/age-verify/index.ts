import { getSetting } from '@/lib/settings';
import type { AgeVerifyProvider } from '@/lib/age-verify/types';

export type { AgeVerifyProvider, VerifyResult } from '@/lib/age-verify/types';

// 服务商注册表：新服务商在这里加一行。还没接任何一家时，需要验证的地区只能由管理员在后台手动标记已验证。
export const PROVIDERS: AgeVerifyProvider[] = [];

export function findProvider(id: string): AgeVerifyProvider | undefined {
  return PROVIDERS.find((item) => item.id === id);
}

export function activeProvider(): AgeVerifyProvider | null {
  const wanted = getSetting('ageVerify.provider', process.env.TAVERN_AGE_VERIFY_PROVIDER ?? '').trim().toLowerCase();
  const chosen = findProvider(wanted);
  if (chosen?.configured()) return chosen;
  return PROVIDERS.find((item) => item.configured()) ?? null;
}

export function providerSummary() {
  const active = activeProvider()?.id ?? null;
  return PROVIDERS.map((item) => ({ id: item.id, label: item.label, hint: item.configHint, configured: item.configured(), active: item.id === active }));
}
