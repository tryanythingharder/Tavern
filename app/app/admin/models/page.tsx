import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminModelsPayload } from '@/lib/admin-models';
import { AdminModels } from '@/components/admin-models';

export const dynamic = 'force-dynamic';

export default async function AdminModelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>模型广场</h1>
          <div className="p-atoolbar-sub">每个模型单独设计费（按量 / 按次 / 按上下文分档）和展示信息；模型列表来自启用的渠道</div>
        </div>
        <div className="p-atoolbar-actions">
          <Link className="p-btn p-btn--sm" href="/models">查看广场</Link>
          <Link className="p-btn p-btn--sm" href="/admin/channels">渠道</Link>
        </div>
      </header>
      <div className="p-acontent">
        <AdminModels initial={adminModelsPayload()} />
      </div>
    </>
  );
}
