import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCharacterView, listOwnedCharacters, listVersions } from '@/lib/characters';
import { CharacterForm } from '@/components/character-form';
import { VersionList } from '@/components/version-list';
import { ProtoCover } from '@/components/proto-cover';
import { WorkActions } from '@/components/work-actions';
import { CreatorStatsView } from '@/components/creator-stats-view';
import { creatorStats } from '@/lib/creator-stats';
import { requestTimeZone } from '@/lib/tz';
import { CardImportPanel } from '@/components/card-import-panel';

export const dynamic = 'force-dynamic';

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ edit?: string; tab?: string; status?: string; days?: string; blank?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { edit, tab, status, days, blank } = await searchParams;
  const editing = edit ? getCharacterView(edit) : undefined;
  const owned = editing && editing.ownerId === user.id ? editing : undefined;
  const works = listOwnedCharacters(user.id);

  const worksNav = (active: 'works' | 'stats') => (
    <div className="p-tabs cs-switch" role="tablist" aria-label="我的作品">
      <Link href="/create?tab=works" role="tab" aria-selected={active === 'works'}>作品</Link>
      <Link href="/create?tab=stats" role="tab" aria-selected={active === 'stats'}>数据</Link>
    </div>
  );

  // 创作者数据：有多少人在玩、每天新开对话、每个作品的收藏评论
  if (tab === 'stats' && !owned) {
    return (
      <div className="p-inner">
        <header className="p-page-title cs-head">
          <div>
            <h1>作品数据</h1>
            <p>你的角色有多少人在玩、聊了多久、收藏和评论，不含你自己的测试对话。</p>
          </div>
          <div className="p-page-title-actions">
            {worksNav('stats')}
          </div>
        </header>
        <CreatorStatsView stats={creatorStats(user.id, days === '30' ? 30 : 7, await requestTimeZone())} />
      </div>
    );
  }

  // 我的作品：原型 create.html?tab=works 的列表视图
  if (tab === 'works' && !owned) {
    const filter = status === 'pending' || status === 'published' || status === 'draft' || status === 'archived' ? status : 'all';
    const rows = filter === 'all' ? works : works.filter((item) => item.status === filter);
    const tabs = [
      ['all', '全部', works.length],
      ['pending', '待审核', works.filter((item) => item.status === 'pending').length],
      ['published', '已发布', works.filter((item) => item.status === 'published').length],
      ['draft', '草稿', works.filter((item) => item.status === 'draft').length],
      ['archived', '已下架', works.filter((item) => item.status === 'archived').length],
    ] as const;

    return (
      <div className="p-inner">
        <header className="p-page-title">
          <div>
            <h1>我的作品</h1>
            <p>草稿、已发布与已下架的角色都在这里。</p>
          </div>
          <div className="p-page-title-actions">
            {worksNav('works')}
            <Link className="p-btn p-btn--primary" href="/create">导入角色卡</Link>
          </div>
        </header>

        <div className="p-filterbar">
          <div className="p-tabs" role="tablist" aria-label="作品状态">
            {tabs.map(([key, label, count]) => (
              <Link
                key={key}
                href={key === 'all' ? '/create?tab=works' : `/create?tab=works&status=${key}`}
                role="tab"
                aria-selected={filter === key}
              >
                {label} {count}
              </Link>
            ))}
          </div>
        </div>

        <div className="p-card p-rows">
          {rows.map((work) => (
            <div className="p-library-row" key={work.id}>
              <ProtoCover character={work} className="p-library-cover" />
              <div className="p-library-main">
                <div className="p-library-name">{work.name}</div>
                <div className="p-library-sub">{work.hook || '还没有写剧情钩子'} · {work.category}</div>
              </div>
              <WorkActions characterId={work.id} status={work.status} />
            </div>
          ))}
          {!rows.length && (
            <div className="p-empty">
              <div className="p-empty-title">这个分类还没有作品</div>
              <p className="p-empty-text">先去创建一个人物，再决定是否发布到广场。</p>
              <Link className="p-btn p-btn--primary" href="/create">导入角色卡</Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 默认入口是导入：制卡交给外部工具；?blank=1 才打开简易表单
  if (!owned && !blank) {
    return (
      <div className="p-inner">
        <CardImportPanel />
      </div>
    );
  }

  return (
    <div className="p-inner">
      <CharacterForm initial={owned} />
      {owned && <VersionList characterId={owned.id} versions={listVersions(owned.id, user.id)} current={{ name: owned.name, hook: owned.hook, greeting: owned.greeting, description: owned.description, pace: owned.pace, alternateGreetings: owned.alternateGreetings, tags: owned.tags, category: owned.category, nsfw: owned.nsfw, card: owned.card }} />}
    </div>
  );
}
