import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCharacterById } from '@/lib/db';
import { linkableCharacters, listLorebooks, listPersonas } from '@/lib/resources-db';
import { PersonasEditor } from '@/components/personas-editor';

export const dynamic = 'force-dynamic';

export default async function PersonasPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const personas = listPersonas(user.id);
  // 可绑定：自己的卡 + 聊过的角色；已经绑定的（比如导入时连上的）也列出来，方便取消
  const linkable = new Map(linkableCharacters(user.id).map((character) => [character.id, character.name]));
  for (const id of personas.flatMap((persona) => persona.boundCharacters)) {
    if (!linkable.has(id)) {
      const character = getCharacterById(id);
      if (character) linkable.set(id, character.name);
    }
  }
  const characters = [...linkable].map(([id, name]) => ({ id, name }));
  const lorebooks = listLorebooks(user.id).map((book) => ({ id: book.id, name: book.name }));

  return (
    <section className="p-section" id="personas">
      <h2>我的身份</h2>
      <p>身份决定你在故事里是谁。用哪个身份：这段故事锁定的 → 绑定了这个角色的 → 默认身份 → 账号昵称（{user.nickname}）。</p>
      <PersonasEditor initial={personas} characters={characters} lorebooks={lorebooks} />
    </section>
  );
}
