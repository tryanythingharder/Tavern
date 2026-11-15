import { fail, idParam, json, requireUser } from '@/lib/api';
import db, { getChat } from '@/lib/db';
import { availableModels } from '@/lib/model';
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
    model: chat.model ?? '',
    models: availableModels(),
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
    model?: string | null;
  };
  // 只改模型：不动预设 / 身份 / 世界书
  if ('model' in body) {
    const chat = getChat(id, user.id);
    if (!chat) return fail('会话不存在', 404);
    const wanted = String(body.model ?? '').trim();
    if (wanted && !availableModels().some((item) => item.id === wanted)) return fail('这个模型目前不可用', 400);
    db.prepare('UPDATE chats SET model = ? WHERE id = ? AND user_id = ?').run(wanted || null, id, user.id);
    if (Object.keys(body).length === 1) return json({ ok: true, model: wanted });
  }
  const ok = updateChatSettings(user.id, id, {
    presetId: body.presetId ?? null,
    personaId: body.personaId ?? null,
    lorebookIds: body.lorebookIds === undefined ? null : body.lorebookIds,
  });
  return ok ? json({ ok: true }) : fail('会话不存在', 404);
}
