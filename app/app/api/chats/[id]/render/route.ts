import { getCurrentUser } from '@/lib/auth';
import db, { getCharacterById, getChat, listMessages, type DbMessage } from '@/lib/db';
import { renderMessage } from '@/lib/ejs-server';
import { modelName } from '@/lib/model';
import { chatVariables } from '@/lib/mvu-server';
import { loadGenerationConfig } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

// GET /api/chats/[id]/render?message=ID —— 楼层里的 EJS 渲染成给人看的文本（components/rich-text.tsx）。不落库、不写变量。
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: '未登录' }, { status: 401 });
  const { id } = await context.params;
  const chat = getChat(Number(id), user.id);
  if (!chat) return Response.json({ message: '会话不存在' }, { status: 404 });
  const messageId = Number(new URL(request.url).searchParams.get('message'));
  const message = db.prepare('SELECT id, role, content FROM messages WHERE id = ? AND chat_id = ?').get(messageId, chat.id) as Pick<DbMessage, 'id' | 'role' | 'content'> | undefined;
  if (!message) return Response.json({ message: '消息不存在' }, { status: 404 });
  const character = getCharacterById(chat.character_id);
  if (!character) return Response.json({ message: '角色不存在' }, { status: 404 });
  const config = loadGenerationConfig(user.id, chat);
  const history = listMessages(chat.id);
  const visible = history.filter((item) => item.role !== 'system');
  const index = visible.findIndex((item) => item.id === message.id);
  const result = await renderMessage(
    message.content,
    { userId: user.id, chatId: chat.id, character, userName: config.userName, loreEntries: config.loreEntries, history, model: modelName(chat.model), variables: chatVariables(chat.id, chat.character_id, { uptoId: message.id }) },
    { message_id: index, swipe_id: 0, name: message.role === 'user' ? config.userName : character.name, is_last: index === visible.length - 1, is_user: message.role === 'user', is_system: false },
  );
  return Response.json({ text: result.text, errors: result.errors }, { headers: { 'Cache-Control': 'no-store' } });
}
