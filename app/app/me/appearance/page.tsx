import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AppearancePanel } from '@/components/appearance-panel';
import { getAppearancePrefs, getTheme } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function AppearancePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const theme = await getTheme();
  const prefs = await getAppearancePrefs();

  return (
    <section className="p-section ua-page" id="appearance">
      <h2>外观</h2>
      <p>主题、字体、字号、对话文字颜色、圆角……都可以按你的习惯调。改动即时生效，只影响你自己的阅读体验。顶栏的「外观」按钮随时打开同一套设置。</p>
      <div className="p-card p-card--pad ua-page-card">
        <AppearancePanel theme={theme} initial={prefs} />
      </div>
    </section>
  );
}
