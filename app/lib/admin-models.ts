import { modelCatalog } from '@/lib/model';
import { emptyMeta, modelCatalogMeta } from '@/lib/model-catalog';
import { configuredExtraModels } from '@/lib/model-extra';
import { guessKind } from '@/lib/model-kind';
import { ownPriceRule, pointsPerThousand } from '@/lib/points';

// 后台「模型广场」页面和接口共用。除了对话渠道里的模型，也列出生图/语音/向量配置里的模型（价格在各自配置里设）。
export function adminModelsPayload() {
  const extras = configuredExtraModels();
  const extraKind = new Map(extras.map((item) => [item.id, item.kind]));
  const models = modelCatalog({ includeHidden: true }).map((item) => ({ id: item.id, kind: extraKind.get(item.id) ?? guessKind(item.id), source: item.source, isDefault: item.isDefault, rule: ownPriceRule(item.id), priceLabel: item.priceLabel, meta: item.meta }));
  const seen = new Set(models.map((item) => item.id));
  const meta = modelCatalogMeta();
  for (const extra of extras) {
    if (seen.has(extra.id)) continue;
    seen.add(extra.id);
    models.push({ id: extra.id, kind: extra.kind, source: extra.source, isDefault: false, rule: null, priceLabel: '', meta: meta[extra.id] ?? emptyMeta() });
  }
  return { basePrice: pointsPerThousand(), models };
}
