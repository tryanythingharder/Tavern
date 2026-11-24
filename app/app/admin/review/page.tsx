import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { REVIEW_LIST, characterStatusCounts, parseList, queryCharacters, type SearchParams } from '@/lib/admin-query';
import { AdminReview } from '@/components/admin-review';
import { AdminListBar, AdminPager } from '@/components/admin-list';
import { AdminHeader } from '@/components/admin-header';

export const dynamic = 'force-dynamic';

export default async function AdminReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const query = parseList(await searchParams, REVIEW_LIST);
  const result = queryCharacters(query);
  const counts = characterStatusCounts();

  return (
    <>
      <AdminHeader href="/admin/review" sub={`待审核 ${counts.pending ?? 0} 个 · 下架后从广场与搜索消失，已有会话仍可读`} />
      <div className="p-acontent">
        <section className="p-card">
          <AdminListBar
            placeholder="搜索角色、作者或角色 ID"
            unit="个作品"
            total={result.total}
            tabs={{ key: 'status', label: '审核状态', fallback: 'pending', options: [
              { value: 'pending', label: '待审核', count: counts.pending ?? 0 },
              { value: 'published', label: '已公开', count: counts.published ?? 0 },
              { value: 'archived', label: '已下架', count: counts.archived ?? 0 },
              { value: '', label: '全部', count: counts[''] ?? 0 },
            ] }}
            selects={[{ key: 'nsfw', label: '按分级筛选', options: [{ value: '', label: '全部分级' }, { value: '1', label: '仅 18+' }, { value: '0', label: '仅全年龄' }] }]}
          />
          <AdminReview characters={result.rows} sort={{ sort: query.sort, dir: query.dir }} filtered={Boolean(query.q || query.f.nsfw)} />
          <AdminPager page={result.page} pages={result.pages} total={result.total} per={result.per} unit="个作品" />
        </section>
      </div>
    </>
  );
}
