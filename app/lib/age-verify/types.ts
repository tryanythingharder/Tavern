// 年龄验证服务插件接口（Yoti / Veriff / Persona / 各地合规服务商等）。
// 新增服务商：在 lib/age-verify/ 下写一个实现，并在 index.ts 的 PROVIDERS 里登记。
// 回调地址固定为 /api/age-verify/<id>；插件只负责发起验证和验签解析，标记通过由通用路由统一做。
export type VerifyResult =
  | { kind: 'verified'; userId: number; reference: string }
  | { kind: 'failed'; userId: number; reason: string }
  | { kind: 'ignore'; reason: string }
  | { kind: 'error'; status: number; message: string };

export interface AgeVerifyProvider {
  id: string;
  label: string;
  /** 后台展示用：需要哪些配置项 */
  configHint: string;
  configured(): boolean;
  /** 发起一次验证，返回跳转地址 */
  start(userId: number, ctx: { siteUrl: string; returnUrl: string }): Promise<string>;
  /** 解析并验签回调 */
  parseCallback(request: Request): Promise<VerifyResult>;
}
