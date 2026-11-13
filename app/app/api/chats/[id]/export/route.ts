import { fail, idParam, requireUser } from '@/lib/api';
import { getChat, getCharacterById, listMessages } from '@/lib/db';
import { exportChat } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/export?format=txt|jsonl —— 下载整段对话
export async function GET(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);
  const character = getCharacterById(chat.character_id);
  const format = new URL(request.url).searchParams.get('format') === 'jsonl' ? 'jsonl' : 'txt';
  const body = exportChat(chat, character?.name ?? '角色', listMessages(chat.id, 10000), format);
  const safeTitle = chat.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || `chat-${chat.id}`;
  return new Response(body, {
    headers: {
      'Content-Type': format === 'jsonl' ? 'application/x-ndjson; charset=utf-8' : 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.${format}`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
