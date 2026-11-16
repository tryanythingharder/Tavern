import { flattenText, moderateText } from '@/lib/auto-moderation';
import { fail, json, requireUser } from '@/lib/api';
import { saveMedia } from '@/lib/storage';
import { createCharacter, setCharacterCover } from '@/lib/characters';
import { parseStCharacterCard } from '@/lib/cards-import';
import { parsePngCard } from '@/lib/png-card';

export const dynamic = 'force-dynamic';

// POST /api/characters/import
//   { json: '…' }       粘贴 SillyTavern V2/V3 JSON
//   { png: 'base64…' }  角色卡 PNG（读取 tEXt/iTXt 的 chara/ccv3），卡面会存成角色封面
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { json?: unknown; png?: unknown };

  if (typeof body.png === 'string' && body.png.trim()) {
    const buffer = Buffer.from(body.png.replace(/^data:image\/png;base64,/, ''), 'base64');
    if (buffer.length > 10 * 1024 * 1024) return fail('图片太大（上限 10MB）', 400);
    const rawCard = parsePngCard(buffer);
    if (!rawCard) return fail('这张 PNG 里没有找到角色卡数据（chara / ccv3）', 400);
    const card = parseStCharacterCard(rawCard);
    if (!card) return fail('角色卡缺少名称等必要字段', 400);
    const verdict = await moderateText(flattenText(card));
    if (!verdict.ok) return fail(verdict.message, 422);
    const character = createCharacter(user.id, user.nickname, card);
    if (!character) return fail('角色卡缺少必要字段', 400);
    const cover = saveMedia(buffer, 'png', { ownerId: user.id, visibility: 'public' });
    setCharacterCover(character.id, cover);
    return json({ character: { ...character, coverImage: cover } }, 201);
  }

  let raw: unknown = body.json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return fail('JSON 解析失败，请检查粘贴内容', 400);
    }
  }
  const card = parseStCharacterCard(raw);
  if (!card) return fail('这不是可识别的角色卡 JSON', 400);
  const verdict = await moderateText(flattenText(card));
  if (!verdict.ok) return fail(verdict.message, 422);
  const character = createCharacter(user.id, user.nickname, card);
  return character ? json({ character }, 201) : fail('角色卡缺少必要字段', 400);
}
