import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat } from '@/lib/db';
import { personaSender, resolvePersona, setChatPersona } from '@/lib/resources-db';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// PUT /api/chats/[id]/persona { personaId: number | null }
// ST 聊天里切换身份 = 锁定到这段聊天；null = 解锁，回到「绑定角色 → 默认身份」。已发的消息保留当时的身份名。
export async function PUT(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const chatId = idParam((await context.params).id);
  if (!chatId) return fail('参数不对', 400);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { personaId?: unknown };
  const personaId = body.personaId === null ? null : Number(body.personaId) || null;
  if (!setChatPersona(user.id, chatId, personaId)) return fail('会话不存在', 404);
  const chat = getChat(chatId, user.id)!;
  const persona = resolvePersona(user.id, { lockedId: chat.persona_id ?? null, characterIds: [chat.character_id] });
  return json({ locked: chat.persona_id ?? null, persona: persona ? { id: persona.id, ...personaSender(user.id, persona) } : { id: null, ...personaSender(user.id, null) } });
}
