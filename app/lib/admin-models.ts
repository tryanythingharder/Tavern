import { modelCatalog } from '@/lib/model';
import { ownPriceRule, pointsPerThousand } from '@/lib/points';

// 后台「模型广场」页面和接口共用
export function adminModelsPayload() {
  return {
    basePrice: pointsPerThousand(),
    models: modelCatalog({ includeHidden: true }).map((item) => ({ id: item.id, source: item.source, isDefault: item.isDefault, rule: ownPriceRule(item.id), priceLabel: item.priceLabel, meta: item.meta })),
  };
}

