import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import db from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { modelCatalog } from '@/lib/model';
import { ModelDefaultButton } from '@/components/model-default-button';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '模型广场' });
}
export const dynamic = 'force-dynamic';

// 模型广场：站内能用的模型、每千 tokens 扣多少点、适合什么玩法。价格由后台「模型广场」单独设置。
export default async function ModelsPage() {
  const user = await getCurrentUser();
  const models = modelCatalog();
  const mine = user ? ((db.prepare('SELECT default_model FROM users WHERE id = ?').get(user.id) as { default_model: string | null } | undefined)?.default_model ?? '') : '';
  const cheapest = models.length ? Math.min(...models.map((item) => item.price)) : 0;

  return (
    <div className="p-inner">
      <header className="p-page-title">
        <div>
          <h1>模型广场</h1>
          <p>每个模型的文风和价格都不一样。设为默认后，新开的对话会用它；对话里也能随时切换。按实际用掉的 tokens 扣点。</p>
        </div>
      </header>
      {!models.length ? (
        <div className="p-empty">
          <div className="p-empty-title">还没有上架的模型</div>
          <p className="p-empty-text">管理员在后台接入渠道后，这里会列出可用的模型。</p>
        </div>
      ) : (
        <div className="mg-grid">
          {models.map((item) => {
            const isMine = mine ? mine === item.id : false;
            return (
              <article key={item.id} className={`p-card p-card--pad mg-card${item.meta.featured ? ' is-featured' : ''}${isMine ? ' is-mine' : ''}`}>
                <div className="mg-head">
                  <h2 className="mg-name">{item.meta.name || item.id}</h2>
                  {item.meta.featured && <span className="p-pill p-pill--sm">推荐</span>}
                  {!mine && item.isDefault && <span className="p-pill p-pill--sm p-pill--outline">站点默认</span>}
                </div>
                {item.meta.name && <code className="mg-id">{item.id}</code>}
                {item.meta.summary && <p className="mg-summary">{item.meta.summary}</p>}
                {(item.meta.tags.length > 0 || item.meta.context) && (
                  <div className="mg-tags">
                    {item.meta.context && <span className="p-pill p-pill--sm p-pill--outline">上下文 {item.meta.context}</span>}
                    {item.meta.tags.map((tag) => <span key={tag} className="p-pill p-pill--sm p-pill--outline">{tag}</span>)}
                  </div>
                )}
                <div className="mg-foot">
                  <span className="mg-price"><b>{item.price}</b> 点 / 千 tokens{item.price === cheapest && models.length > 1 ? <span className="p-small"> · 最省</span> : null}</span>
                  {user ? <ModelDefaultButton model={item.id} active={isMine} /> : <Link className="p-btn p-btn--sm" href="/login">登录后选择</Link>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="p-small mg-note">一次回复大约 1–3 千 tokens（设定越长、聊得越久，每条越多）。点数余额和明细在「我的 → 点数」。</p>
    </div>
  );
}
