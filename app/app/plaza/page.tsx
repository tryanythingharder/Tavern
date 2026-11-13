import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { listCharacterViews } from '@/lib/characters';
import { hideNsfw } from '@/lib/prefs';
import { getBlockedAuthors } from '@/lib/blocked';
import { PlazaBrowser } from '@/components/plaza-browser';

export const metadata: Metadata = { title: '广场', description: '浏览社区里的公开角色。' };
export const dynamic = 'force-dynamic';

export default async function PlazaPage() {
  const user = await getCurrentUser();
  const characters = listCharacterViews();
  const blocked = await getBlockedAuthors();

  return (
    <div className="p-inner">
      <PlazaBrowser characters={characters} initialHideNsfw={hideNsfw(user?.id ?? null)} initialBlocked={blocked} />
    </div>
  );
}
