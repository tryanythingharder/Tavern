import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import db from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { modelCatalog } from '@/lib/model';
import { parseContextTokens } from '@/lib/model-catalog';
import { priceRule } from '@/lib/points';
import { contextWindow } from '@/lib/prompt';
import { modelTraits, modelVendor } from '@/lib/model-vendor';
import { ModelSquare, type SquareModel } from '@/components/model-square';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '模型广场' });
}
export const dynamic = 'force-dynamic';

// 模型广场（参考 new-api）：厂商 / 计费方式 / 标签筛选、搜索、排序、卡片与列表、详情抽屉。价格由后台「模型广场」设置。
export default async function ModelsPage() {
  const user = await getCurrentUser();
  const mine = user ? ((db.prepare('SELECT default_model FROM users WHERE id = ?').get(user.id) as { default_model: string | null } | undefined)?.default_model ?? '') : '';
  const models: SquareModel[] = modelCatalog().map((item, index) => {
    const rule = priceRule(item.id);
    const listed = parseContextTokens(item.meta.context);
    // 后台没填上下文时，按实际生效的窗口（站点默认，受全站封顶限制）显示，标成「默认」，和真实裁剪历史时一致
    const contextTokens = listed || contextWindow(item.id, 0).window;
    const context = listed ? item.meta.context : `${Math.round(contextTokens / 1000)}K`;
    return {
      id: item.id,
      name: item.meta.name || item.id,
      summary: item.meta.summary,
      tags: item.meta.tags,
      traits: modelTraits(item.id, listed),
      context,
      contextDefault: !listed,
      contextTokens,
      featured: item.meta.featured,
      siteDefault: item.isDefault,
      mine: mine === item.id,
      mode: rule.mode,
      price: rule.price,
      tiers: rule.tiers,
      priceLabel: item.priceLabel,
      vendor: modelVendor(item.id),
      order: index,
    };
  });
  return (
    <div className="p-inner ms-page">
      <ModelSquare models={models} signedIn={Boolean(user)} hasMine={Boolean(mine)} />
    </div>
  );
}
