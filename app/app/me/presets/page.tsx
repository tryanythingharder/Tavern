import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ensureDefaultPreset, listPresets } from '@/lib/resources-db';
import { PresetsEditor } from '@/components/presets-editor';

export const dynamic = 'force-dynamic';

export default async function PresetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  ensureDefaultPreset(user.id);

  return (
    <section className="p-section" id="presets">
      <h2>预设</h2>
      <p>预设决定语气、采样参数、上下文模板与 Instruct 序列。对话页可以为单个故事选择预设。</p>
      <PresetsEditor initial={listPresets(user.id)} />
    </section>
  );
}
