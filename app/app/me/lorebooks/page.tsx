import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { chatBoundLorebookIds, globalLorebookIds, listLorebooks } from '@/lib/resources-db';
import { LorebooksEditor } from '@/components/lorebooks-editor';
import { getGenPrefs } from '@/lib/gen-prefs';
import { embedConfig } from '@/lib/vectors';

export const dynamic = 'force-dynamic';

export default async function LorebooksPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="lorebooks">
      <h2>世界书</h2>
      <p>世界书按关键词把设定插进上下文；常驻条目每轮都会进入。勾了「全局」的书对所有聊天生效；也可以在聊天设置里给某个聊天或角色单独绑定。</p>
      <LorebooksEditor initial={listLorebooks(user.id)} initialGlobal={globalLorebookIds(user.id)} chatBound={chatBoundLorebookIds(user.id)} initialStrategy={getGenPrefs(user.id).loreStrategy} initialVectors={getGenPrefs(user.id).loreVectors} vectorsReady={Boolean(embedConfig())} />
    </section>
  );
}
