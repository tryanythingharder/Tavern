import type { PaymentProvider } from '@/lib/payments/types';

// 手动确认：订单落 pending，管理员在后台「订单」里确认到账。永远可用，作为兜底。
export const manualProvider: PaymentProvider = {
  id: 'manual',
  label: '手动确认',
  configHint: '无需配置',
  configured: () => true,
  createCheckout: async () => null,
};
