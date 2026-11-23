import { trMeta } from '@/lib/i18n/runtime';
import { qrState } from '@/lib/quick-replies-db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, getProfileMedia } from '@/lib/auth';
import { PointsChip } from '@/components/points-chip';
import { resolveBackground } from '@/lib/backgrounds';
import { ChatBackdropLayer, ChatBackgroundButton } from '@/components/chat-background';
import { balance as pointsBalance } from '@/lib/points';
import { getCharacterById, getCharacterLook } from '@/lib/db';
import { pageCssHref } from '@/lib/css-assets';
import { imageConfig, imageConfigured, imageCost } from '@/lib/media';
import { characterHasImage } from '@/lib/image-ref';
import { getRoom, insertRoomGreetings, listRoomMessages, roomFamily } from '@/lib/rooms';
import { RoomMemoryButton } from '@/components/room-memory';
import { ChatBranches } from '@/components/chat-branches';
import { listPersonas, listRegexRules, loadRoomConfig } from '@/lib/resources-db';
import { characterRegexRules } from '@/lib/card-extras';
import { RoomChat } from '@/components/room-chat';
import { AppearanceButton } from '@/components/appearance-drawer';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '房间' });
}
export const dynamic = 'force-dynamic';

const STRATEGY_LABEL: Record<string, string> = { natural: '自然（叫名字优先）', roundRobin: '轮流', manual: '手动指定', pooled: '随机' };

export default async function RoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const room = getRoom(Number(id), user.id);
  if (!room) notFound();

  const members = room.characterIds
    .map((characterId) => getCharacterById(characterId))
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
    .map((character) => ({ id: character.id, name: character.name, initial: character.initial, hue: character.hue, avatar: character.avatar_image || character.cover_image || (character.owner_id === null ? `/characters/${character.id}.jpg` : null), muted: room.muted.includes(character.id) }));
  // ST：群聊为空时插入各成员的开场白
  insertRoomGreetings(room);
  const messages = listRoomMessages(room.id);
  const branches = roomFamily(user.id, room);
  const from = Number((await searchParams).from) || null;
  const config = loadRoomConfig(user.id, room);
  const userName = config.userName;
  const personaProp = {
    current: { id: config.persona?.id ?? null, name: userName, avatar: config.persona?.avatar ?? null },
    options: listPersonas(user.id).map((item) => ({ id: item.id, name: item.name, avatar: item.avatar, isDefault: item.isDefault, bound: room.characterIds.some((cid) => item.boundCharacters.includes(cid)) })),
    lockedId: room.personaId,
  };
  const activeCount = members.filter((member) => !room.muted.includes(member.id)).length;
  const strategyLabel = STRATEGY_LABEL[room.strategy] ?? room.strategy;

  const bg = resolveBackground('room', room.id, user.id);
  return (
    <main className="p-inner">
      {pageCssHref('chat') ? <link rel="stylesheet" href={pageCssHref('chat')} precedence="yh-page" /> : null}
      <ChatBackdropLayer src={bg.src} />
      <div className="p-rp-workbench" data-room="">
        <div className="p-chat">
          <header className="p-chat-head">
            <div className="p-chat-col p-chat-head-in">
              <Link className="p-chat-icon" href="/rooms" aria-label="返回房间列表">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </Link>
              <PointsChip initial={pointsBalance(user.id)} />
              <div className="p-chat-title">
                <div className="p-chat-title-text">
                  <div className="p-chat-name">{room.name}</div>
                  <div className="p-chat-sub">{activeCount}/{members.length} 位成员发言 · {strategyLabel}{room.autoMode ? ' · 自动推进' : ''}</div>
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <RoomMemoryButton roomId={room.id} />
              <ChatBackgroundButton kind="room" id={room.id} value={bg.value} />
              <AppearanceButton className="p-chat-icon ua-trigger--icon" />
              <Link className="p-chat-icon" href="/rooms" aria-label="房间设置">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
              </Link>
              </div>
            </div>
          </header>
          <ChatBranches info={branches} justCreated={Boolean(from && from === branches.parent?.id)} base="/rooms" />
          <div className="p-rp-status">
            <span>多角色房间 · 回复由模型生成 · 按 token 扣点</span>
            <span>{strategyLabel}{room.autoMode ? ' · 自动推进' : ''}</span>
          </div>
          <RoomChat
            accountAvatar={getProfileMedia(user.id).avatar}
            roomId={room.id}
            strategy={room.strategy}
            members={members}
            initialMessages={messages}
            userName={userName}
            persona={personaProp}
            autoMode={room.autoMode}
            defaultSpeakerId={room.speakerId}
            media={{
              image: imageConfigured(),
              imageCost: imageCost(),
              reference: imageConfig().reference,
              looks: Object.fromEntries(room.characterIds.map((cid) => [cid, getCharacterLook(user.id, cid)])),
              hasImage: Object.fromEntries(room.characterIds.map((cid) => { const c = getCharacterById(cid); return [cid, c ? characterHasImage(c) : false]; })),
            }}
            displayRules={listRegexRules(user.id).filter((rule) => rule.enabled && rule.scope !== 'send')}
            quickReplies={qrState(user.id, { roomId: room.id })}
            memberRules={Object.fromEntries(members.map((member) => [member.id, characterRegexRules(member.id).filter((rule) => rule.enabled && rule.scope !== 'send')]))}
          />
        </div>

        <aside className="p-rp-context" aria-label="房间设定">
          <div className="p-rp-context-head"><span>故事档案</span><small>ENSEMBLE</small></div>
          <section className="p-rp-context-section">
            <div className="p-rp-context-label">本场角色</div>
            <div className="p-rp-context-list">
              {members.map((member) => (
                <div className="p-rp-context-line" key={member.id}>
                  <span className={`p-avatar${member.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '28px', ['--h' as string]: member.hue }}>{member.avatar ? <img src={member.avatar} alt="" loading="lazy" /> : member.initial}</span>
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
