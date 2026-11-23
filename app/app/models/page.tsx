import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import db from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { modelCatalog } from '@/lib/model';
import { parseContextTokens } from '@/lib/model-catalog';
import { priceRule } from '@/lib/points';
import { contextWindow } from '@/lib/prompt';
import { modelVendor } from '@/lib/model-vendor';
import { modelCatalogMeta } from '@/lib/model-catalog';
import { guessKind, kindCapabilities } from '@/lib/model-kind';
import { configuredExtraModels } from '@/lib/model-extra';
import { ModelSquare, type SquareModel } from '@/components/model-square';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '模型广场' });
}
export const dynamic = 'force-dynamic';

// 模型广场（参考 new-api）：厂商 / 计费方式 / 标签筛选、搜索、排序、卡片与列表、详情抽屉。价格由后台「模型广场」设置。
export default async function ModelsPage() {
  const user = await getCurrentUser();
  const mine = user ? ((db.prepare('SELECT default_model FROM users WHERE id = ?').get(user.id) as { default_model: string | null } | undefined)?.default_model ?? '') : '';
  const extras = configuredExtraModels();
  const extraKind = new Map(extras.map((item) => [item.id, item]));
  const models: SquareModel[] = modelCatalog().map((item, index) => {
    const rule = priceRule(item.id);
    const listed = parseContextTokens(item.meta.context);
    // 渠道里的模型按 id 猜类别；后台生图/语音/向量配置里用的同名模型以配置为准
    const configured = extraKind.get(item.id);
    const kind = configured?.kind ?? guessKind(item.id);
    const chat = kind === 'chat';
    // 后台没填上下文时，按实际生效的窗口（站点默认，受全站封顶限制）显示，标成「默认」，和真实裁剪历史时一致
    const contextTokens = chat ? listed || contextWindow(item.id, 0).window : 0;
    const context = !chat ? '' : listed ? item.meta.context : `${Math.round(contextTokens / 1000)}K`;
    return {
      id: item.id,
      kind,
      name: item.meta.name || item.id,
      summary: item.meta.summary,
      tags: item.meta.tags,
      traits: kindCapabilities(kind, item.id, listed),
      context,
      contextDefault: chat && !listed,
      contextTokens,
      featured: item.meta.featured,
      siteDefault: chat && item.isDefault,
      mine: chat && mine === item.id,
      mode: configured ? 'call' : rule.mode,
      price: configured ? configured.cost : rule.price,
      tiers: configured ? [] : rule.tiers,
      priceLabel: item.priceLabel,
      vendor: modelVendor(item.id),
      order: index,
    };
  });
  // 只在生图/语音/向量配置里出现、渠道里没有的模型，追加在后面
  const meta = modelCatalogMeta();
  const listedIds = new Set(models.map((item) => item.id));
  for (const extra of extras) {
    if (listedIds.has(extra.id) || meta[extra.id]?.hidden) continue;
    const info = meta[extra.id];
    listedIds.add(extra.id);
    models.push({
      id: extra.id,
      kind: extra.kind,
      name: info?.name || extra.id,
      summary: info?.summary ?? '',
      tags: info?.tags ?? [],
      traits: kindCapabilities(extra.kind, extra.id, 0),
      context: '',
      contextDefault: false,
      contextTokens: 0,
      featured: info?.featured ?? false,
      siteDefault: false,
      mine: false,
      mode: 'call',
      price: extra.cost,
      tiers: [],
      priceLabel: '',
      vendor: modelVendor(extra.id),
      order: models.length,
    });
  }
  return (
    <div className="p-inner ms-page">
      <ModelSquare models={models} signedIn={Boolean(user)} hasMine={Boolean(mine)} />
    </div>
  );
}
