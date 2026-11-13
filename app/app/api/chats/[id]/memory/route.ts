import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat, getCharacterById, listMessages } from '@/lib/db';
import { memorySettings, refreshSummary, summaryStatus, updateMemorySettings } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/memory —— 摘要状态、检索设置、手动记忆
export async function GET(_request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const messages = listMessages(chat.id);
  const settings = memorySettings(chat);
  return json({
    status: summaryStatus(chat, messages.length),
    rag: settings.ragPrefs,
    memory: settings.memory,
    messageCount: messages.length,
    recentWindow: 8,
  });
}

// PATCH /api/chats/[id]/memory —— 改设置 / 手改摘要 / 立即刷新
export async function PATCH(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);

  const body = (await request.json().catch(() => ({}))) as {
    summaryEnabled?: boolean;
    summaryInterval?: number;
    summaryText?: string;
    ragEnabled?: boolean;
    ragTopK?: number;
    memory?: string;
    refresh?: boolean;
  };
  if (!updateMemorySettings(chat.id, user.id, body)) return fail('保存失败', 400);

  const character = getCharacterById(chat.character_id);
  const messages = listMessages(chat.id);
  if (body.refresh) refreshSummary(chat.id, character?.name ?? '角色', messages, true);

  const updated = getChat(chat.id, user.id)!;
  const settings = memorySettings(updated);
  return json({
    status: summaryStatus(updated, messages.length),
    rag: settings.ragPrefs,
    memory: settings.memory,
  });
}
