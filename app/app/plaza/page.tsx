import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { listCharacterViews } from '@/lib/characters';
import { nsfwAccess } from '@/lib/age-gate';
import { getBlockedAuthors } from '@/lib/blocked';
import { PlazaBrowser } from '@/components/plaza-browser';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '广场', description: '浏览社区里的公开角色。' });
}
export const dynamic = 'force-dynamic';

export default async function PlazaPage({ searchParams }: { searchParams: Promise<{ category?: string; tag?: string | string[] }> }) {
  const params = await searchParams;
  const initialTags = (Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  const user = await getCurrentUser();
  const access = await nsfwAccess(user?.id ?? null);
  // 不能看 18+ 时服务端就滤掉，不把成人向卡发到前端
  const characters = listCharacterViews(undefined, { hideNsfw: !access.allowed });
  const blocked = await getBlockedAuthors();

  return (
    <div className="p-inner">
      <PlazaBrowser characters={characters} initialHideNsfw={!access.show} nsfwState={access.state} minAge={access.minAge} initialBlocked={blocked} initialCategory={params.category} initialTags={initialTags} />
    </div>
  );
}
