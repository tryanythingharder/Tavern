import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat, getCharacterById, listMessages, type DbChat } from '@/lib/db';
import {
  authorNote,
  characterNote,
  memorySettings,
  RECENT_WINDOW,
  saveCharacterNote,
  SUMMARY_PROMPT_DEFAULT,
  SUMMARY_TEMPLATE_DEFAULT,
  summaryStatus,
  updateMemorySettings,
  type CharacterNoteMode,
  type MemoryPatch,
} from '@/lib/memory';
import { summarizeNow, summarizing } from '@/lib/memory-llm';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function payload(chat: DbChat, userId: number, extra: Record<string, unknown> = {}) {
  const messages = listMessages(chat.id);
  const settings = memorySettings(chat);
  return {
    status: { ...summaryStatus(chat, messages.length), running: summarizing(chat.id) },
    rag: settings.ragPrefs,
    memory: settings.memory,
    note: authorNote(chat),
    characterNote: characterNote(userId, chat.character_id),
    characterName: getCharacterById(chat.character_id)?.name ?? '',
    defaults: { summaryPrompt: SUMMARY_PROMPT_DEFAULT, summaryTemplate: SUMMARY_TEMPLATE_DEFAULT },
    messageCount: messages.length,
    recentWindow: RECENT_WINDOW,
    ...extra,
  };
}

// GET /api/chats/[id]/memory —— 摘要状态与设置、检索设置、手动记忆、作者注释
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  return json(payload(chat, user.id));
}

// PATCH /api/chats/[id]/memory —— 改设置 / 手改摘要 / 立即刷新（refresh: true，模型模式会等摘要生成完）
//   characterNote: { text, mode }  角色注释，对这个角色的所有会话生效
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);

  const body = (await request.json().catch(() => ({}))) as MemoryPatch & { refresh?: boolean; characterNote?: { text?: unknown; mode?: unknown } };
  if (!updateMemorySettings(chat.id, user.id, body)) return fail('保存失败', 400);
  if (body.characterNote && typeof body.characterNote.text === 'string') {
    const mode: CharacterNoteMode = body.characterNote.mode === 'before' || body.characterNote.mode === 'after' ? body.characterNote.mode : 'replace';
    saveCharacterNote(user.id, chat.character_id, { text: body.characterNote.text, mode });
  }
  let error: string | undefined;
  if (body.refresh) error = (await summarizeNow(chat.id, user.id)).error;
  return json(payload(getChat(chat.id, user.id)!, user.id, error ? { error } : {}));
}
