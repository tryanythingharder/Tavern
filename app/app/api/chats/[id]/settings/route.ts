import { fail, idParam, json, requireUser } from '@/lib/api';
import db, { getChat } from '@/lib/db';
import { availableModels, modelName } from '@/lib/model';
import { contextWindow } from '@/lib/prompt';
import { cardLoreList, normalizeCardLore, parseCardLore } from '@/lib/card-extras';
import { activeLorebooks, characterLoreLinks, chatSettings, createLorebook, ensureDefaultPreset, globalLorebookIds, listLorebooks, listPersonas, listPresets, resolvePersona, setCharacterLoreLinks, setChatLorebook, updateChatSettings } from '@/lib/resources-db';
import { getCharacterById } from '@/lib/db';

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
    // 当前模型的上下文上限，设置面板里给「上下文长度」做提示
    context: contextWindow(modelName(chat.model), 0),
    models: availableModels(),
    presets: listPresets(user.id).map((preset) => ({ id: preset.id, name: preset.name, params: preset.params })),
    personas: listPersonas(user.id).map((persona) => ({ id: persona.id, name: persona.name, boundCharacters: persona.boundCharacters })),
    // 卡内世界书：玩家按会话开关
    cardLore: cardLoreList(chat.character_id, parseCardLore(chat.card_lore)),
    lorebooks: listLorebooks(user.id).map((book) => ({ id: book.id, name: book.name, count: book.entries.length })),
    // ST 世界书绑定：全局（null = 全部）、角色附加、聊天世界书，以及这次实际生效的书和来源
    globalLorebookIds: globalLorebookIds(user.id),
    characterLorebookIds: characterLoreLinks(user.id, chat.character_id),
    chatLorebookId: chat.chat_lorebook_id ?? null,
    activeLorebooks: activeLorebooks(user.id, {
      chatPick: chatSettings(chat).lorebookIds,
      characterIds: [chat.character_id],
      chatLorebookId: chat.chat_lorebook_id ?? null,
      persona: resolvePersona(user.id, { lockedId: chat.persona_id ?? null, characterIds: [chat.character_id] }),
    }).map(({ book, sources }) => ({ id: book.id, name: book.name, sources })),
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
    cardLore?: Record<string, boolean> | null;
    chatLorebookId?: number | null;
    createChatLorebook?: boolean;
    characterLorebookIds?: number[];
  };
  // 世界书绑定（ST Chat Lore / 角色附加世界书）：各自即时保存，不动其它设置
  if ('chatLorebookId' in body || body.createChatLorebook || 'characterLorebookIds' in body) {
    const chat = getChat(id, user.id);
    if (!chat) return fail('会话不存在', 404);
    const out: { chatLorebookId?: number | null; characterLorebookIds?: number[]; created?: { id: number; name: string } } = {};
    if (body.createChatLorebook) {
      // ST：没有聊天世界书时新建一本，名字取自聊天
      const name = `聊天 · ${(getCharacterById(chat.character_id)?.name ?? chat.title ?? '').slice(0, 30)} #${chat.id}`;
      const book = createLorebook(user.id, name, []);
      setChatLorebook(user.id, 'chat', chat.id, book.id);
      out.chatLorebookId = book.id;
      out.created = { id: book.id, name: book.name };
    } else if ('chatLorebookId' in body) {
      const value = Number(body.chatLorebookId) || null;
      setChatLorebook(user.id, 'chat', chat.id, value);
      out.chatLorebookId = getChat(id, user.id)?.chat_lorebook_id ?? null;
    }
    if (Array.isArray(body.characterLorebookIds)) out.characterLorebookIds = setCharacterLoreLinks(user.id, chat.character_id, body.characterLorebookIds.map(Number));
    return json({ ok: true, ...out });
  }
  // 卡内世界书开关：单独保存，null = 全部恢复卡默认
  if ('cardLore' in body) {
    const chat = getChat(id, user.id);
    if (!chat) return fail('会话不存在', 404);
    const value = body.cardLore && typeof body.cardLore === 'object' ? normalizeCardLore(chat.character_id, body.cardLore) : {};
    db.prepare('UPDATE chats SET card_lore = ? WHERE id = ? AND user_id = ?').run(Object.keys(value).length ? JSON.stringify(value) : null, id, user.id);
    if (Object.keys(body).length === 1) return json({ ok: true, cardLore: value });
  }
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
