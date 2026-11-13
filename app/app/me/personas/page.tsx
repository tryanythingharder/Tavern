import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listCharacters } from '@/lib/db';
import { listPersonas } from '@/lib/resources-db';
import { PersonasEditor } from '@/components/personas-editor';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const characters = listCharacters().map((character) => ({ id: character.id, name: character.name, hook: character.hook }));

  return (
    <section className="p-section" id="personas">
      <h2>我的身份</h2>
      <p>身份决定你在故事里是谁；绑定角色后开新故事会默认使用。</p>
      <PersonasEditor initial={listPersonas(user.id)} characters={characters} />
    </section>
  );
}
