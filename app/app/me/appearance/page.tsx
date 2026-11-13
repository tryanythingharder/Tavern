import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAppearance } from '@/lib/prefs';
import { AppearanceSettings } from '@/components/appearance-settings';
import { ThemeSwitch } from '@/components/theme-switch';
import { getTheme } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const theme = await getTheme();

  return (
    <>
    <section className="p-section" id="theme">
      <h2>界面主题</h2>
      <p>书页像读小说，夜幕像看电影，戏台像收集角色卡。随时可以换。</p>
      <ThemeSwitch initial={theme} variant="cards" />
    </section>
    <section className="p-section" id="appearance">
      <h2>聊天外观</h2>
      <p>只影响你的阅读体验，不改变其他玩家。</p>
      <AppearanceSettings initial={getAppearance(user.id)} />
    </section>
    </>
  );
}
