import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listRegexRules } from '@/lib/resources-db';
import { RegexEditor } from '@/components/regex-editor';

export const dynamic = 'force-dynamic';

export default async function RegexPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <section className="p-section" id="regex">
      <h2>正则</h2>
      <p>正则规则在消息进入上下文前或生成结果落库前做替换。</p>
      <RegexEditor initial={listRegexRules(user.id)} />
    </section>
  );
}
