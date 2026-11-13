import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listLorebooks } from '@/lib/resources-db';
import { LorebooksEditor } from '@/components/lorebooks-editor';

export const dynamic = 'force-dynamic';

export default async function LorebooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="lorebooks">
      <h2>世界书</h2>
      <p>世界书按关键词把设定插进上下文；常驻条目每轮都会进入。</p>
      <LorebooksEditor initial={listLorebooks(user.id)} />
    </section>
  );
}
