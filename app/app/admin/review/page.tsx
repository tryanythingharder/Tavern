import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { adminCharacters } from '@/lib/admin';
import { AdminReview } from '@/components/admin-review';

export const dynamic = 'force-dynamic';

export default async function AdminReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const characters = adminCharacters();

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>广场审核</h1>
          <div className="p-atoolbar-sub">{characters.length} 个用户作品 · 下架后从广场与搜索消失，已有会话仍可读</div>
        </div>
      </header>
      <div className="p-acontent">
        <section className="p-card">
          <AdminReview characters={characters} />
        </section>
      </div>
    </>
  );
}
