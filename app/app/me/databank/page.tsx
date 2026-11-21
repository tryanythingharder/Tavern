import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listDataBank } from '@/lib/data-bank';
import { getGenPrefs } from '@/lib/gen-prefs';
import { embedConfig } from '@/lib/vectors';
import { listChats, getCharacterById } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { DataBankEditor } from '@/components/data-bank-editor';

export const dynamic = 'force-dynamic';

export default async function DataBankPage({ searchParams }: { searchParams: Promise<{ chat?: string; room?: string; character?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const params = await searchParams;
  const chats = listChats(user.id);
  const rooms = listRooms(user.id);
  const characterIds = [...new Set(chats.map((chat) => chat.character_id))];
  const characters = characterIds.map((id) => ({ id, label: getCharacterById(id)?.name ?? id }));
  const targets = {
    characters,
    chats: chats.map((chat) => ({ id: String(chat.id), label: `${chat.character_name} · ${chat.title || `聊天 ${chat.id}`}` })),
    rooms: rooms.map((room) => ({ id: String(room.id), label: room.name })),
  };
  const preset = params.chat ? { scope: 'chat' as const, scopeId: params.chat } : params.room ? { scope: 'room' as const, scopeId: params.room } : params.character ? { scope: 'character' as const, scopeId: params.character } : undefined;

  return (
    <section className="p-section" id="databank">
      <h2>资料库</h2>
      <p>上传设定集、长篇背景、规则说明等文本资料，生成时自动参考（对应 SillyTavern 的 Data Bank）。资料可以对所有聊天生效，也可以只给某个角色、某段聊天或某个群聊。</p>
      <DataBankEditor initial={listDataBank(user.id)} prefs={getGenPrefs(user.id).dataBank} ready={Boolean(embedConfig())} targets={targets} preset={preset} />
    </section>
  );
}
