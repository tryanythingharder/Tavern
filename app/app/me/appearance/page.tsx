import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAppearance } from '@/lib/prefs';
import { AppearanceSettings } from '@/components/appearance-settings';

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="appearance">
      <h2>聊天外观</h2>
      <p>只影响你的阅读体验，不改变其他玩家。</p>
      <AppearanceSettings initial={getAppearance(user.id)} />
    </section>
  );
}
