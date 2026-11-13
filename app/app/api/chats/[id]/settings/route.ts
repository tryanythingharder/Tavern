import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat } from '@/lib/db';
import { chatSettings, ensureDefaultPreset, listLorebooks, listPersonas, listPresets, updateChatSettings } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/settings —— 对话页设定面板一次取齐
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  ensureDefaultPreset(user.id);
  return json({
    settings: chatSettings(chat),
    presets: listPresets(user.id).map((preset) => ({ id: preset.id, name: preset.name })),
    personas: listPersonas(user.id).map((persona) => ({ id: persona.id, name: persona.name, boundCharacters: persona.boundCharacters })),
    lorebooks: listLorebooks(user.id).map((book) => ({ id: book.id, name: book.name, count: book.entries.length })),
  });
}

// PATCH /api/chats/[id]/settings —— { presetId, personaId, lorebookIds }
// lorebookIds 传 null 表示「全部世界书」，传 [] 表示「一本都不用」。
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const body = (await request.json().catch(() => ({}))) as {
    presetId?: number | null;
    personaId?: number | null;
    lorebookIds?: number[] | null;
  };
  const ok = updateChatSettings(user.id, id, {
    presetId: body.presetId ?? null,
    personaId: body.personaId ?? null,
    lorebookIds: body.lorebookIds === undefined ? null : body.lorebookIds,
  });
  return ok ? json({ ok: true }) : fail('会话不存在', 404);
}
