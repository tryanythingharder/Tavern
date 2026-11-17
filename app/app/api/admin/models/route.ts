import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { logAdmin } from '@/lib/audit';
import { modelCatalog } from '@/lib/model';
import { saveModelCatalogMeta } from '@/lib/model-catalog';
import { modelPrices, pointsPerThousand } from '@/lib/points';
import { setSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function payload() {
  const prices = modelPrices();
  return {
    basePrice: pointsPerThousand(),
    models: modelCatalog({ includeHidden: true }).map((item) => ({ id: item.id, source: item.source, isDefault: item.isDefault, price: item.price, ownPrice: item.id in prices, meta: item.meta })),
  };
}

// GET /api/admin/models —— 模型广场后台：所有启用渠道里的模型 + 展示信息 + 单独价格
export async function GET() {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return fail('没有权限', 403);
  return json(payload());
}

// PUT { models: [{ id, price, meta }] } —— price 为空/null 表示跟随全局单价
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user || !isAdmin(user)) return fail('没有权限', 403);
  const body = (await request.json().catch(() => ({}))) as { models?: { id?: unknown; price?: unknown; meta?: unknown }[] };
  if (!Array.isArray(body.models)) return fail('参数不对', 400);
  const prices = modelPrices();
  const meta: Record<string, unknown> = {};
  for (const item of body.models.slice(0, 300)) {
    const id = String(item.id ?? '').trim();
    if (!id) continue;
    meta[id] = item.meta ?? {};
    const raw = item.price;
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      delete prices[id];
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100000) return fail(`「${id}」的价格不对`, 400);
      prices[id] = Math.round(value * 100) / 100;
    }
  }
  saveModelCatalogMeta(meta);
  setSetting('points.models', JSON.stringify(prices));
  logAdmin(user.id, 'models.catalog', `${Object.keys(meta).length} 个模型`);
  return json(payload());
}
