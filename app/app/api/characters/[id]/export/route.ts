import { fail } from '@/lib/api';
import { nsfwBlock } from '@/lib/age-gate';
import { getCharacterView } from '@/lib/characters';
import { getCurrentUser } from '@/lib/auth';
import { loadExtras } from '@/lib/card-extras';
import { embedPngCard } from '@/lib/png-card';
import { readMedia } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/characters/[id]/export[?format=png]
// 导出 SillyTavern V2 卡（PNG 同时写 chara + ccv3）。外部导入的卡在原始数据上覆盖平台字段，
// 世界书、正则脚本、酒馆助手脚本等平台不改的部分原样带回，做到无损往返。
export async function GET(request: Request, context: Params) {
  const user = await getCurrentUser();
  const { id } = await context.params;
  const character = getCharacterView(id);
  if (!character) return fail('角色不存在', 404);
  if (character.status !== 'published' && (!user || character.ownerId !== user.id)) return fail('没有权限', 403);
  const blocked18 = await nsfwBlock(user?.id ?? null, character);
  if (blocked18) return fail(blocked18, 403);

  const extras = loadExtras(id);
  const raw = extras.raw ?? {};
  const rawExt = raw.extensions && typeof raw.extensions === 'object' ? (raw.extensions as Record<string, unknown>) : {};
  const data: Record<string, unknown> = {
    ...raw,
    name: character.name,
    description: character.description,
    personality: character.card.personality,
    scenario: character.card.scenario || (extras.raw ? '' : character.pace),
    first_mes: character.greeting,
    mes_example: character.card.mesExample,
    creator_notes: character.card.creatorNotes || character.hook,
    system_prompt: character.card.systemPrompt,
    post_history_instructions: character.card.postHistory,
    alternate_greetings: character.alternateGreetings.map((opening) => opening.text),
    tags: character.tags,
    creator: typeof raw.creator === 'string' && raw.creator ? raw.creator : character.author,
    character_version: typeof raw.character_version === 'string' && raw.character_version ? raw.character_version : '1.0',
    extensions: { ...rawExt, tavern: { category: character.category, nsfw: character.nsfw, pace: character.pace } },
  };
  const v2 = { spec: 'chara_card_v2', spec_version: '2.0', data };
  const base = `${character.name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'character'}`;

  const wantPng = new URL(request.url).searchParams.get('format') === 'png';
  if (wantPng) {
    const cover = character.coverImage ?? '';
    const name = cover.startsWith('/media/') ? cover.slice('/media/'.length) : '';
    const file = name ? await readMedia(name, user?.id ?? null) : null;
    // 封面可能已经是 webp/jpg（新生成的图、旧图转换过）：导出 PNG 卡时现转一份 PNG
    let pngBuffer = file?.buffer ?? null;
    if (file && file.extension !== 'png') {
      try { const sharp = (await import('sharp')).default; pngBuffer = await sharp(file.buffer).png().toBuffer(); } catch { pngBuffer = null; }
    }
    const png = pngBuffer ? embedPngCard(pngBuffer, { chara: v2, ccv3: { spec: 'chara_card_v3', spec_version: '3.0', data } }) : null;
    if (!png) return fail('这个角色没有 PNG 封面，请导出 JSON', 400);
    return new Response(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.png`)}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(JSON.stringify(v2, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${base}.json`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
