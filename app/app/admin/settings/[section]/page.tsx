import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminSettings, type SettingsSection } from '@/components/admin-settings';
import { AdminConfigPage } from '@/components/admin-config-page';

export const dynamic = 'force-dynamic';

const SECTIONS: SettingsSection[] = ['billing', 'payment', 'growth', 'context', 'image', 'tts', 'embedding', 'mail'];

export default async function AdminSettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const { section } = await params;
  if (!SECTIONS.includes(section as SettingsSection)) notFound();
  return (
    <AdminConfigPage href={`/admin/settings/${section}`} guide={section}>
      <AdminSettings only={section as SettingsSection} />
    </AdminConfigPage>
  );
}
