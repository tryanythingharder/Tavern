import { fail, requireUser } from '@/lib/api';
import { nsfwBlock } from '@/lib/age-gate';
import { addMessage, createChat, getCharacterById, setMessageReasoning, setMessagesHidden } from '@/lib/db';
import { parseChatImport } from '@/lib/chat-import';
import { writeHelperVars } from '@/lib/helper-vars';
import { listLorebooks, setChatLorebook } from '@/lib/resources-db';
import { IMPORT_JSON_LIMIT, jsonOr413 } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES = 5000;

// POST /api/chats/import —— 导入 SillyTavern / 本站 / 常见 RP 客户端的聊天记录
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);

  const rawBody = await jsonOr413(request, IMPORT_JSON_LIMIT, {});
  if (rawBody instanceof Response) return rawBody;
  const body = rawBody as { characterId?: unknown; title?: unknown; text?: unknown };
  const characterId = String(body.characterId ?? '');
  const character = characterId ? getCharacterById(characterId) : undefined;
  if (!character) return fail('先选择一个角色，再导入聊天记录', 400);
  const blocked18 = await nsfwBlock(user.id, character);
  if (blocked18) return fail(blocked18, 403);
  if (character.owner_id !== null && character.owner_id !== user.id && character.status !== 'published') {
    return fail('这个角色还没有公开', 403);
  }

  const text = String(body.text ?? '');
  if (!text.trim()) return fail('请选择文件或粘贴内容', 400);
  if (text.length > MAX_BYTES) return fail('文件超过 8MB', 400);

  const parsed = parseChatImport(text);
  if (!parsed || !parsed.messages.length) {
    return fail('没有识别出聊天记录。请确认是 SillyTavern 的 .jsonl，或支持的 .json 格式。', 400);
  }
  if (parsed.messages.length > MAX_MESSAGES) {
    return fail(`记录超过 ${MAX_MESSAGES} 条，请拆分后再导入`, 400);
  }

  const base = String(body.title ?? '').trim() || parsed.title.trim() || character.name;
  const title = `${base.replace(/\.(jsonl?|txt)$/i, '').slice(0, 40)} · 导入`;
  const chatId = createChat(user.id, character.id, title);

  try {
    for (const message of parsed.messages) {
      const saved = addMessage(chatId, message.role, message.content, message.candidates, message.selected);
      if (message.hidden) setMessagesHidden(chatId, [saved.id], true);
      if (message.reasoning && message.role === 'assistant') setMessageReasoning(saved.id, saved.selected, message.reasoning);
    }
    // ST chat_metadata：聊天变量照搬；聊天世界书按书名找自己已有的那本（ST 也是按名字关联）
    if (parsed.variables && Object.keys(parsed.variables).length) writeHelperVars(user.id, 'chat', String(chatId), parsed.variables);
    if (parsed.worldInfo) {
      const book = listLorebooks(user.id).find((item) => item.name === parsed.worldInfo);
      if (book) setChatLorebook(user.id, 'chat', chatId, book.id);
    }
  } catch (error) {
    // 导入失败时回滚，避免留下半截会话
    const { deleteChat } = await import('@/lib/db');
    deleteChat(chatId, user.id);
    throw error;
  }

  return Response.json({ chatId, count: parsed.messages.length, title });
}
