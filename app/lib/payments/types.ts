import type { Order } from '@/lib/billing';

// 支付渠道插件接口。新增渠道：在 lib/payments/ 下写一个实现，并在 index.ts 的 PROVIDERS 里登记。
// 回调地址固定为 /api/payments/<id>；金额、币种、订单存在性与幂等到账由通用路由统一校验，插件只负责验签和解析。
export type CheckoutContext = { siteUrl: string; currency: string; email?: string };

export type WebhookResult =
  | { kind: 'paid'; orderId: number; amountCents: number; currency: string; reference: string }
  | { kind: 'ignore'; reason: string }
  | { kind: 'error'; status: number; message: string };

export interface PaymentProvider {
  id: string;
  label: string;
  /** 后台展示用：需要哪些配置项 */
  configHint: string;
  configured(): boolean;
  /** 返回支付页地址；返回 null 表示没有在线支付页（由管理员手动确认） */
  createCheckout(order: Order, ctx: CheckoutContext): Promise<string | null>;
  /** 解析并验签回调；没有回调的渠道不实现 */
  parseWebhook?(request: Request): Promise<WebhookResult>;
}
