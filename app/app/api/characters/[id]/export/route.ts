import { fail } from '@/lib/api';
import { getCharacterView } from '@/lib/characters';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/characters/[id]/export —— 导出 SillyTavern V2 角色卡 JSON
export async function GET(_request: Request, context: Params) {
  const user = await getCurrentUser();
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return fail('角色不存在', 404);
  if (character.status !== 'published' && (!user || character.ownerId !== user.id)) return fail('没有权限', 403);

  const card = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: character.name,
      description: character.description,
      personality: '',
      scenario: character.pace,
      first_mes: character.greeting,
      mes_example: '',
      creator_notes: character.hook,
      system_prompt: '',
      post_history_instructions: '',
      alternate_greetings: character.alternateGreetings.map((opening) => opening.text),
      tags: character.tags,
      creator: character.author,
      character_version: '1.0',
      extensions: { tavern: { category: character.category, nsfw: character.nsfw } },
    },
  };
  const filename = `${character.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'character'}.json`;
  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
