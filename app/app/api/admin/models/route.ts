import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { adminModelsPayload } from '@/lib/admin-models';
import { saveModelCatalogMeta } from '@/lib/model-catalog';
import { modelPrices, normalizeRule, priceRules, type PriceRule } from '@/lib/points';
import { setSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// GET /api/admin/models —— 模型广场后台：所有启用渠道里的模型 + 展示信息 + 计费规则
export async function GET() {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return fail('没有权限', 403);
  return json(adminModelsPayload());
}

// PUT { models: [{ id, rule: {mode:'token'|'call', price, tiers:[{above, price}]} | null, meta }] }
// rule 为 null 表示跟随全局单价（按量）
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { models?: { id?: unknown; rule?: unknown; meta?: unknown }[] };
  if (!Array.isArray(body.models)) return fail('参数不对', 400);
  const rules: Record<string, PriceRule> = priceRules();
  const legacy = modelPrices();
  const meta: Record<string, unknown> = {};
  for (const item of body.models.slice(0, 300)) {
    const id = String(item.id ?? '').trim();
    if (!id) continue;
    meta[id] = item.meta ?? {};
    delete legacy[id]; // 新规则接管，旧的 points.models 不再留副本
    if (item.rule === null || item.rule === undefined) {
      delete rules[id];
      continue;
    }
    const rule = normalizeRule(item.rule);
    if (!rule) return fail(`「${id}」的价格不对`, 400);
    rules[id] = rule;
  }
  saveModelCatalogMeta(meta);
  setSetting('points.rules', JSON.stringify(rules));
  setSetting('points.models', JSON.stringify(legacy));
  logAdmin(user.id, 'models.catalog', `${Object.keys(meta).length} 个模型`);
  return json(adminModelsPayload());
}
