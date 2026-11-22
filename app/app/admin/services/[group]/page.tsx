import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { AdminServices } from '@/components/admin-services';
import { AdminConfigPage } from '@/components/admin-config-page';
import { SERVICE_GROUPS } from '@/lib/service-config';

export const dynamic = 'force-dynamic';

export default async function AdminServiceGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const { group } = await params;
  if (group !== 'age' && !SERVICE_GROUPS.some((item) => item.id === group)) notFound();
  return (
    <AdminConfigPage href={`/admin/services/${group}`} guide={group}>
      <AdminServices only={group} />
    </AdminConfigPage>
  );
}
