import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminModelsPayload } from '@/lib/admin-models';
import { AdminModels } from '@/components/admin-models';
import { UnsavedGuard } from '@/components/admin-feedback';

export const dynamic = 'force-dynamic';

export default async function AdminModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  return (
    <>
      <AdminHeader href="/admin/models" sub={<>每个模型单独设计费（按量 / 按次 / 按上下文分档）和展示信息；模型列表来自启用的渠道</>} actions={<><Link className="p-btn p-btn--sm" href="/models">查看广场</Link>
          <Link className="p-btn p-btn--sm" href="/admin/channels">渠道</Link></>} />
      <div className="p-acontent">
        <UnsavedGuard><AdminModels initial={adminModelsPayload()} /></UnsavedGuard>
      </div>
    </>
  );
}
