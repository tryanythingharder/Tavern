import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { qrState } from '@/lib/quick-replies-db';
import { QuickRepliesEditor } from '@/components/quick-replies-editor';

export const dynamic = 'force-dynamic';

export default async function QuickRepliesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="quick-replies">
      <h2>快捷回复</h2>
      <p>和 SillyTavern 的 Quick Reply 一样：按钮按「集」管理，显示在对话输入框上方。内容可以是一句话，也可以是斜杠命令；还能设成进入聊天、发消息后或角色回复后自动执行。</p>
      <QuickRepliesEditor initial={qrState(user.id)} />
    </section>
  );
}
