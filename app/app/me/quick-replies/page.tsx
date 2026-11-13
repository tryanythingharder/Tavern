import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listQuickReplies } from '@/lib/resources-db';
import { QuickRepliesEditor } from '@/components/quick-replies-editor';

export const dynamic = 'force-dynamic';

export default async function QuickRepliesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="quick-replies">
      <h2>快捷回复</h2>
      <p>快捷回复会显示在对话输入框上方，点一下把内容填进去。</p>
      <QuickRepliesEditor initial={listQuickReplies(user.id)} />
    </section>
  );
}
