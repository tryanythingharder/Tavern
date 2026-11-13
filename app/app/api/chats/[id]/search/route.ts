import { fail, idParam, json, requireUser } from '@/lib/api';
import { getChat } from '@/lib/db';
import { searchMessages } from '@/lib/memory';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// GET /api/chats/[id]/search?q=…&bookmarks=1 —— 聊天内搜索 / 书签列表
export async function GET(request: Request, context: Params) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const id = idParam((await context.params).id);
  if (!id) return fail('参数不对', 400);
  const chat = getChat(id, user.id);
  if (!chat) return fail('会话不存在', 404);

  const url = new URL(request.url);
  const query = url.searchParams.get('q') ?? '';
  const bookmarksOnly = url.searchParams.get('bookmarks') === '1';
  return json({ hits: searchMessages(chat.id, query, bookmarksOnly), query, bookmarksOnly });
}
