import { providerSummary } from '@/lib/payments';
import { driverSummary } from '@/lib/storage-drivers';
import { growthConfig } from '@/lib/growth';
import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { deleteSetting, getSetting, hasSetting, setSetting } from '@/lib/settings';
import { imageConfig, ttsConfig } from '@/lib/media';
import { logAdmin } from '@/lib/audit';
import { parseContextTokens } from '@/lib/model-catalog';
import { paymentCurrency, pricePerPointCents, upstreamCostPer1kCents } from '@/lib/billing';
import { modelFallbacks } from '@/lib/model';
import { modelPrices, parseModelPrices, pointsPerThousand } from '@/lib/points';
import { availableModels } from '@/lib/model';

export const dynamic = 'force-dynamic';

// keySource：own = 后台单独设置；fallback = 用模型 Key 兜底；none = 没有可用密钥
function keySource(ownKey: string, envKeys: (string | undefined)[]): 'own' | 'fallback' | 'none' {
  if (hasSetting(ownKey)) return 'own';
  return envKeys.some((value) => Boolean(value)) ? 'fallback' : 'none';
}

function status() {
  const image = imageConfig();
  const tts = ttsConfig();
  return {
    image: {
      baseUrl: image.baseUrl, model: image.model, size: image.size, cost: image.cost,
      hasKey: Boolean(image.apiKey), keySource: keySource('image.apiKey', [process.env.TAVERN_IMAGE_API_KEY, process.env.TAVERN_MODEL_API_KEY]),
    },
    tts: {
      baseUrl: tts.baseUrl, model: tts.model, voice: tts.voice, cost: tts.cost,
      hasKey: Boolean(tts.apiKey), keySource: keySource('tts.apiKey', [process.env.TAVERN_TTS_API_KEY, process.env.TAVERN_MODEL_API_KEY]),
    },
    payment: {
      pricePerPointCents: pricePerPointCents(),
      provider: getSetting('payment.provider', ''),
      checkoutUrl: getSetting('payment.checkoutUrl', ''),
      currency: paymentCurrency(),
      hasSecret: Boolean(getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? '')),
      providers: providerSummary(),
      storage: driverSummary(),
    },
    billing: {
      textPer1k: pointsPerThousand(),
      upstreamCostPer1kCents: upstreamCostPer1kCents(),
      // 按模型单独定价：每行「模型id=每千 tokens 点数」，没写的模型按统一价
      modelPrices: Object.entries(modelPrices()).map(([id, price]) => `${id}=${price}`).join('\n'),
      models: availableModels().map((item) => item.id),
      ...growthConfig(),
      // 上下文：模型没标上限时的默认窗口、全站封顶（tokens；空 = 默认 32K / 不封顶）
      defaultContext: getSetting('prompt.defaultContext', ''),
      maxContext: getSetting('prompt.maxContext', ''),
    },
    model: {
      baseUrl: getSetting('model.baseUrl', process.env.TAVERN_MODEL_BASE_URL ?? ''),
      name: getSetting('model.name', process.env.TAVERN_MODEL_NAME ?? ''),
      hasKey: Boolean(getSetting('model.apiKey', process.env.TAVERN_MODEL_API_KEY ?? '')),
      // 备用线路：JSON 数组，只回传条数与线路名，不回传密钥
      fallbackCount: modelFallbacks().length,
      fallbackRoutes: modelFallbacks().map((route) => ({ baseUrl: route.baseUrl, model: route.model })),
    },
    mail: {
      from: getSetting('mail.from', process.env.TAVERN_MAIL_FROM ?? ''),
      hasKey: Boolean(getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? '')),
      mode: getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? '') && getSetting('mail.from', process.env.TAVERN_MAIL_FROM ?? '') ? 'resend' : 'outbox',
    },
  };
}

// GET /api/admin/settings —— 只返回配置状态，密钥不回传
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json(status());
}

type Group = Record<string, unknown>;

// PATCH /api/admin/settings —— 分组建配置；空字符串表示「保持不变」（密钥不会因为留空被清掉）
export async function PATCH(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);

  const body = (await request.json().catch(() => ({}))) as { image?: Group; tts?: Group; payment?: Group; mail?: Group; billing?: Group; model?: Group };

  const write = (group: Group | undefined, map: Record<string, string>) => {
    if (!group) return;
    for (const [field, key] of Object.entries(map)) {
      const value = group[field];
      if (typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (!trimmed) continue; // 留空 = 不修改（密钥尤其如此）
      setSetting(key, trimmed);
    }
    // clear: ['apiKey'] —— 显式清除某个字段（包括回到环境变量）
    const clear = Array.isArray(group.clear) ? (group.clear as unknown[]).filter((item): item is string => typeof item === 'string') : [];
    for (const field of clear) {
      const key = map[field];
      if (key) deleteSetting(key);
    }
  };

  write(body.image, { baseUrl: 'image.baseUrl', apiKey: 'image.apiKey', model: 'image.model', size: 'image.size', cost: 'points.image' });
  write(body.tts, { baseUrl: 'tts.baseUrl', apiKey: 'tts.apiKey', model: 'tts.model', voice: 'tts.voice', cost: 'points.tts' });
  write(body.payment, { pricePerPointCents: 'billing.pricePerPointCents', provider: 'payment.provider', secret: 'payment.secret', checkoutUrl: 'payment.checkoutUrl', currency: 'payment.currency' });
  write(body.mail, { from: 'mail.from', resendKey: 'mail.resend_key' });
  if (body.billing && typeof body.billing.modelPrices === 'string' && body.billing.modelPrices.trim()) {
    body.billing.modelPrices = JSON.stringify(parseModelPrices(body.billing.modelPrices));
  }
  for (const key of ['dailyFree', 'firstTopupPct', 'inviteReward', 'inviteeBonus', 'inviteMax'] as const) {
    if (body.billing && typeof body.billing[key] === 'string') body.billing[key] = String(Math.max(0, Math.round(Number(body.billing[key]) || 0)));
  }
  for (const key of ['defaultContext', 'maxContext'] as const) {
    if (body.billing && typeof body.billing[key] === 'string') {
      const tokens = parseContextTokens(body.billing[key] as string);
      if (tokens) body.billing[key] = String(tokens);
      else { delete body.billing[key]; deleteSetting(key === 'defaultContext' ? 'prompt.defaultContext' : 'prompt.maxContext'); }
    }
  }
  write(body.billing, {
    defaultContext: 'prompt.defaultContext', maxContext: 'prompt.maxContext',
    modelPrices: 'points.models', textPer1k: 'points.text', upstreamCostPer1kCents: 'billing.upstreamCostPer1kCents',
    dailyFree: 'growth.dailyFree', firstTopupPct: 'growth.firstTopupPct', inviteReward: 'growth.inviteReward', inviteeBonus: 'growth.inviteeBonus', inviteMax: 'growth.inviteMax',
  });
  write(body.model, { baseUrl: 'model.baseUrl', apiKey: 'model.apiKey', name: 'model.name', fallbacks: 'model.fallbacks' });

  const changed = ['image', 'tts', 'payment', 'mail', 'billing', 'model'].filter((key) => Boolean(body[key as keyof typeof body]));
  if (changed.length) logAdmin(user.id, '修改接口配置', changed.join(' / '));

  return json(status());
}
