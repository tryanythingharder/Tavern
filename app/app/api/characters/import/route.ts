import { flattenText, moderateText } from '@/lib/auto-moderation';
import { fail, json, requireUser } from '@/lib/api';
import { saveMedia } from '@/lib/storage';
import { createCharacter, getCharacterView, setCharacterCover, updateCharacter } from '@/lib/characters';
import { logActivity } from '@/lib/audit';
import { parseStCharacterCard } from '@/lib/cards-import';
import { parsePngCard } from '@/lib/png-card';
import { extractExtras, extrasSummary, saveExtras } from '@/lib/card-extras';
import { cardCompat } from '@/lib/card-compat';
import { IMPORT_JSON_LIMIT, jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// POST /api/characters/import
//   { json: '…' }       粘贴 SillyTavern V1/V2/V3 JSON
//   { png: 'base64…' }  角色卡 PNG（读取 tEXt/iTXt 的 chara/ccv3），卡面会存成角色封面
//   { characterId }     可选：覆盖更新自己已有的角色（外部工具改完卡再导入，保留评论/收藏/版本历史）
// 平台表单装不下的部分（内嵌世界书、正则脚本、深度提示、原始 JSON）存到 card_extras，导出时原样带回。
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsed = await jsonOr413(request, IMPORT_JSON_LIMIT, {});
  if (parsed instanceof Response) return parsed;
  const body = parsed as { json?: unknown; png?: unknown; characterId?: unknown };
  const targetId = typeof body.characterId === 'string' && body.characterId ? body.characterId : null;

  let raw: unknown = null;
  let pngBuffer: Buffer | null = null;
  if (typeof body.png === 'string' && body.png.trim()) {
    pngBuffer = Buffer.from(body.png.replace(/^data:image\/png;base64,/, ''), 'base64');
    if (pngBuffer.length > 20 * 1024 * 1024) return fail('图片太大（上限 20MB）', 400);
    raw = parsePngCard(pngBuffer);
    if (!raw) return fail('这张 PNG 里没有找到角色卡数据（chara / ccv3）', 400);
  } else {
    raw = body.json;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return fail('JSON 解析失败，请检查粘贴内容', 400);
      }
    }
  }

  const card = parseStCharacterCard(raw);
  if (!card) return fail('这不是可识别的角色卡（缺少名称）', 400);
  const extras = extractExtras(raw);
  const verdict = await moderateText(flattenText(card));
  if (!verdict.ok) return fail(verdict.message, 422);

  // 更新已有角色时保留平台里设的分类与节奏（ST 卡没有这两项）
  const existing = targetId ? getCharacterView(targetId) : undefined;
  const character = targetId
    ? existing && existing.ownerId === user.id
      ? updateCharacter(user.id, targetId, { ...card, category: existing.category, pace: existing.pace, nsfw: card.nsfw || existing.nsfw })
      : null
    : createCharacter(user.id, user.nickname, card);
  if (!character) return fail(targetId ? '找不到要更新的角色，或你不是作者' : '角色卡缺少必要字段', 400);
  saveExtras(character.id, extras);
  logActivity({ actorId: user.id, action: 'character.import', targetType: 'character', targetId: character.id, detail: { format: pngBuffer ? 'png' : 'json', update: Boolean(targetId), status: character.status } });
  let coverImage = character.coverImage;
  if (pngBuffer) {
    coverImage = saveMedia(pngBuffer, 'png', { ownerId: user.id, visibility: 'public' });
    setCharacterCover(character.id, coverImage);
  }
  return json({ character: { ...character, coverImage }, extras: extrasSummary(extras), compat: cardCompat(raw) }, targetId ? 200 : 201);
}
