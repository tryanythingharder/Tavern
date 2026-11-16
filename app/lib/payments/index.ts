import { getSetting } from '@/lib/settings';
import { hostedProvider } from '@/lib/payments/hosted';
import { manualProvider } from '@/lib/payments/manual';
import { stripeProvider } from '@/lib/payments/stripe';
import type { PaymentProvider } from '@/lib/payments/types';

export type { PaymentProvider, CheckoutContext, WebhookResult } from '@/lib/payments/types';

// 渠道注册表：新渠道在这里加一行。顺序 = 自动选择时的优先级（manual 永远放最后兜底）。
export const PROVIDERS: PaymentProvider[] = [stripeProvider, hostedProvider, manualProvider];

export function findProvider(id: string): PaymentProvider | undefined {
  return PROVIDERS.find((item) => item.id === id);
}

// 当前收款渠道：后台 payment.provider / env TAVERN_PAYMENT_PROVIDER 指定且已配置就用它；
// 否则（留空、写的是旧版备注文字、或没配好）自动选第一个已配置的渠道。
export function activeProvider(): PaymentProvider {
  const wanted = (getSetting('payment.provider', process.env.TAVERN_PAYMENT_PROVIDER ?? '') || '').trim().toLowerCase();
  const chosen = findProvider(wanted);
  if (chosen?.configured()) return chosen;
  return PROVIDERS.find((item) => item.configured()) ?? manualProvider;
}

export function providerSummary() {
  const active = activeProvider().id;
  return PROVIDERS.map((item) => ({ id: item.id, label: item.label, hint: item.configHint, configured: item.configured(), active: item.id === active }));
}
