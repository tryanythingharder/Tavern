import { fail, requireUser } from '@/lib/api';
import { listChats, listMessages } from '@/lib/db';
import { listOwnedCharacters, listFavoriteCharacters, listAddedCharacters } from '@/lib/characters';
import { listLorebooks, listPersonas, listPresets, listQuickReplies, listRegexRules } from '@/lib/resources-db';
import { listOverrides } from '@/lib/cards';
import { listNotifications } from '@/lib/notifications';
import { listReportsByReporter } from '@/lib/moderation';
import { listLedger } from '@/lib/points';

export const dynamic = 'force-dynamic';

// GET /api/me/export —— 导出账号数据（不含密码哈希、会话令牌与站点密钥）
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);

  const chats = listChats(user.id).map((chat) => ({
    id: chat.id,
    title: chat.title,
    characterId: chat.character_id,
    createdAt: chat.created_at,
    updatedAt: chat.updated_at,
    messages: listMessages(chat.id, 10000).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      candidates: message.candidates ? JSON.parse(message.candidates) : [],
      selected: message.selected,
      bookmark: message.bookmark === 1,
      attachment: message.attachment ? JSON.parse(message.attachment) : null,
      createdAt: message.created_at,
    })),
  }));

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
    characters: listOwnedCharacters(user.id),
    library: { added: listAddedCharacters(user.id), favorites: listFavoriteCharacters(user.id) },
    chats,
    personas: listPersonas(user.id),
    presets: listPresets(user.id),
    lorebooks: listLorebooks(user.id),
    regexRules: listRegexRules(user.id),
    quickReplies: listQuickReplies(user.id),
    cardOverrides: listOverrides(user.id),
    notifications: listNotifications(user.id, 200),
    reports: listReportsByReporter(user.id, 100),
    pointsLedger: listLedger(user.id, 500),
  };

  const filename = `tavern-${user.nickname || 'user'}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
