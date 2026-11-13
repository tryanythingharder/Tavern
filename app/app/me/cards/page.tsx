import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listCharacters } from '@/lib/db';
import { listOverrides } from '@/lib/cards';
import { CardsEditor } from '@/components/cards-editor';

export const dynamic = 'force-dynamic';

export default async function CardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const characters = listCharacters().map((character) => ({ id: character.id, name: character.name, hook: character.hook }));

  return (
    <section className="p-section" id="cards">
      <h2>角色卡</h2>
      <p>角色卡字段对应 ST 的 system_prompt / post_history / mes_example / depth_prompt。</p>
      <CardsEditor characters={characters} initial={listOverrides(user.id)} />
    </section>
  );
}
