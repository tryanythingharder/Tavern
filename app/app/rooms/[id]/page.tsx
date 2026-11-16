import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getCharacterById } from '@/lib/db';
import { getRoom, listRoomMessages } from '@/lib/rooms';
import { listPersonas } from '@/lib/resources-db';
import { RoomChat } from '@/components/room-chat';
import { AppearanceButton } from '@/components/appearance-drawer';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '房间' });
}
export const dynamic = 'force-dynamic';

const STRATEGY_LABEL: Record<string, string> = { natural: '自然（叫名字优先）', roundRobin: '轮流', manual: '手动指定', pooled: '随机' };

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const room = getRoom(Number(id), user.id);
  if (!room) notFound();

  const members = room.characterIds
    .map((characterId) => getCharacterById(characterId))
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
    .map((character) => ({ id: character.id, name: character.name, initial: character.initial, hue: character.hue, muted: room.muted.includes(character.id) }));
  const messages = listRoomMessages(room.id);
  const userName = listPersonas(user.id)[0]?.name ?? '你';
  const activeCount = members.filter((member) => !room.muted.includes(member.id)).length;
  const strategyLabel = STRATEGY_LABEL[room.strategy] ?? room.strategy;

  return (
    <main className="p-inner">
      <div className="p-rp-workbench" data-room="">
        <div className="p-chat">
          <header className="p-chat-head">
            <div className="p-chat-col p-chat-head-in">
              <Link className="p-chat-icon" href="/rooms" aria-label="返回房间列表">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </Link>
              <div className="p-chat-title">
                <div className="p-chat-title-text">
                  <div className="p-chat-name">{room.name}</div>
                  <div className="p-chat-sub">{activeCount}/{members.length} 位成员发言 · {strategyLabel}{room.autoMode ? ' · 自动推进' : ''}</div>
                </div>
              </div>
              <AppearanceButton className="p-chat-icon ua-trigger--icon" />
              <Link className="p-chat-icon" href="/rooms" aria-label="房间设置">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
              </Link>
            </div>
          </header>
          <div className="p-rp-status">
            <span>多角色房间 · 回复由模型生成 · 按 token 扣点</span>
            <span>{strategyLabel}{room.autoMode ? ' · 自动推进' : ''}</span>
          </div>
          <RoomChat
            roomId={room.id}
            strategy={room.strategy}
            members={members}
            initialMessages={messages}
            userName={userName}
            autoMode={room.autoMode}
            defaultSpeakerId={room.speakerId}
          />
        </div>

        <aside className="p-rp-context" aria-label="房间设定">
          <div className="p-rp-context-head"><span>故事档案</span><small>ENSEMBLE</small></div>
          <section className="p-rp-context-section">
            <div className="p-rp-context-label">本场角色</div>
            <div className="p-rp-context-list">
              {members.map((member) => (
                <div className="p-rp-context-line" key={member.id}>
                  <span className="p-avatar" style={{ ['--size' as string]: '28px', ['--h' as string]: member.hue }}>{member.initial}</span>
                  <span>{member.name}{room.muted.includes(member.id) && <span className="p-msg-flag">已静音</span>}</span>
                </div>
              ))}
            </div>
            <p className="p-rp-context-note">成员与静音只影响后续，历史不会删除。</p>
          </section>
          <section className="p-rp-context-section">
            <div className="p-rp-context-label">当前调度</div>
            <div className="p-rp-context-value">{strategyLabel}{room.autoMode ? ' · 自动推进' : ''}</div>
            <p className="p-rp-context-note">输入 @角色名 可直接点名。</p>
            <Link className="p-rp-context-action" href="/rooms">编辑房间与成员 →</Link>
          </section>
          <section className="p-rp-context-section">
            <div className="p-rp-context-label">记录与边界</div>
            <p className="p-rp-context-note">消息保存在账号里，回复由模型生成。</p>
            <Link className="p-rp-context-action" href="/chats">查看全部故事 →</Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
