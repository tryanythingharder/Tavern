import { fail, json, requireUser } from '@/lib/api';
import { addDataBankFile, listDataBank, type DataBankScope } from '@/lib/data-bank';
import { checkScope, fileText } from '@/lib/data-bank-scope';
import { getChat } from '@/lib/db';
import { getRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

// GET /api/data-bank[?chatId=&characterId=&roomId=] —— 资料库文件列表（带参数时只列这段聊天能用到的：全局 + 角色 + 聊天）
export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const url = new URL(request.url);
  const filter: { scope: DataBankScope; scopeId: string }[] = [];
  const chatId = url.searchParams.get('chatId');
  const roomId = url.searchParams.get('roomId');
  const characterIds = url.searchParams.getAll('characterId');
  // 只给了聊天 / 群聊：自动带上对应角色（群聊 = 全部成员）的资料
  if (chatId) { const chat = getChat(Number(chatId), user.id); if (chat) characterIds.push(chat.character_id); }
  if (roomId) { const room = getRoom(Number(roomId), user.id); if (room) characterIds.push(...room.characterIds); }
  if (chatId || roomId || characterIds.length) {
    filter.push({ scope: 'global', scopeId: '' });
    if (chatId) filter.push({ scope: 'chat', scopeId: chatId });
    if (roomId) filter.push({ scope: 'room', scopeId: roomId });
    for (const id of characterIds) filter.push({ scope: 'character', scopeId: id });
  }
  return json({ files: listDataBank(user.id, filter.length ? filter : undefined) });
}

// POST /api/data-bank —— { scope, scopeId, name, content } 新增一份资料（文本；HTML 会去标签）
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { scope?: unknown; scopeId?: unknown; name?: unknown; content?: unknown };
  const scope = checkScope(user.id, body.scope ?? 'global', body.scopeId);
  if (!scope) return fail('作用范围不对', 400);
  if (typeof body.content !== 'string') return fail('没有内容', 400);
  const name = typeof body.name === 'string' ? body.name : '';
  const result = addDataBankFile(user.id, { ...scope, name, content: fileText(name, body.content) });
  if ('error' in result) return fail(result.error, 400);
  return json({ file: result });
}
