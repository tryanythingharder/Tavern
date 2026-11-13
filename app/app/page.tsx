import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { listCharacterViews } from '@/lib/characters';
import { listChats } from '@/lib/db';
import { listRooms } from '@/lib/rooms';
import { hideNsfw } from '@/lib/prefs';
import { getViewMode } from '@/lib/view';
import { CinemaHome } from '@/components/cinema-home';
import { HomeGrid } from '@/components/home-grid';
import { ProtoAvatar, ProtoCover } from '@/components/proto-cover';
import { HomeHero } from '@/components/home-hero';

export const dynamic = 'force-dynamic';

const ARROW = (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);

export default async function HomePage() {
  const user = await getCurrentUser();
  const view = await getViewMode();
  const all = listCharacterViews(undefined, { hideNsfw: hideNsfw(user?.id ?? null) });
  // 与原型一致：推荐/场景/全部角色默认排除 18+（主角位单独放 featured）
  const featured = all.find((character) => character.id === 'shen-yanzhi') ?? all.find((character) => !character.nsfw) ?? all[0];
  const safe = all.filter((character) => !character.nsfw && character.id !== featured?.id);
  const recs = [...(featured ? [featured] : []), ...safe].slice(0, 4);
  const scenes = safe.slice(0, 5);
  const grid = all.filter((character) => !character.nsfw);
  const chats = user ? listChats(user.id).slice(0, 4) : [];
  const rooms = user ? listRooms(user.id).slice(0, 3) : [];
  const returning = chats.length > 0;

  if (view === 'cinema') {
    return (
      <div className="p-inner">
        <CinemaHome characters={all} userName={user?.nickname} returning={returning} />
      </div>
    );
  }

  return (
    <div className="p-inner">
      <div className="ca-home">
        <HomeHero
          characters={[...(featured ? [featured] : []), ...safe].filter((character) => character.coverImage || character.ownerId === null).slice(0, 5)}
          greeting={`${returning ? '欢迎回来' : '欢迎来到酒馆'}，${user?.nickname ?? '旅人'}`}
          sub={returning ? '今天想和谁说说话？' : '挑一个角色，写下第一句。'}
        />

        <section className="ca-block">
          <div className="ca-block-head"><h2>为您推荐</h2><Link href="/plaza">查看全部 {ARROW}</Link></div>
          <div className="ca-rec-row">
            {recs.map((character) => (
              <Link className="ca-rec" href={`/c/${character.id}`} key={character.id}>
                <ProtoCover character={character} className="ca-rec-cover" />
                <div className="ca-rec-main">
                  <div className="ca-rec-name">{character.name}</div>
                  <div className="ca-rec-author">由 @{character.author} 创建</div>
                  <p className="ca-rec-hook">{character.hook}</p>
                  <div className="ca-rec-meta">
                    <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z" /></svg>
                    <span>{character.chats}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="ca-block">
          <div className="ca-block-head"><h2>场景</h2><Link href="/plaza">更多场景 {ARROW}</Link></div>
          <div className="ca-scene-row">
            {scenes.map((character) => (
              <div className="ca-scene-item" key={character.id}>
                <Link className="ca-scene" href={`/c/${character.id}`}>
                  <ProtoCover character={character} className="ca-scene-cover" />
                  <div className="ca-scene-foot">
                    <span className="ca-scene-title">{character.name}</span>
                    <span className="ca-scene-cta"><ProtoAvatar character={character} size={20} /><span>开始对话</span></span>
                  </div>
                </Link>
                <div className="ca-scene-author">由 @{character.author} 创建</div>
              </div>
            ))}
          </div>
        </section>

        {chats.length > 0 && (
          <section className="ca-block">
            <div className="ca-block-head"><h2>继续上次的故事</h2><Link href="/chats">全部对话 {ARROW}</Link></div>
            <div className="ca-chat-list">
              {chats.map((chat) => {
                const cover = {
                  id: chat.character_id,
                  name: chat.character_name,
                  initial: chat.character_initial,
                  hue: chat.character_hue,
                  ownerId: chat.character_owner,
                };
                return (
                  <Link className="p-continue-card" href={`/chats/${chat.id}`} key={chat.id}>
                    <ProtoAvatar character={cover} size={40} />
                    <span className="p-continue-text">
                      <span className="p-continue-name">{chat.character_name}<span className="p-continue-time"> · {chat.title}</span></span>
                      <span className="p-continue-last">{chat.last_message ?? '还没有消息'}</span>
                    </span>
                    {ARROW}
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="ca-block">
          <div className="ca-block-head"><h2>多角色房间</h2><Link href="/rooms">全部房间 {ARROW}</Link></div>
          <div className="ca-chat-list">
            {rooms.map((room) => (
              <Link className="p-continue-card" href={`/rooms/${room.id}`} key={room.id}>
                <span className="p-avatar" style={{ ['--size' as string]: '40px', ['--h' as string]: 210 }}>{room.name.slice(0, 1)}</span>
                <span className="p-continue-text">
                  <span className="p-continue-name">{room.name}</span>
                  <span className="p-continue-last">{room.lastMessage ?? '还没有消息'}</span>
                </span>
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0m1-14a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5" /></svg>
              </Link>
            ))}
            <Link className="p-continue-card" href="/rooms">
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span className="p-continue-name">创建房间</span>
            </Link>
          </div>
        </section>

        <section className="ca-block">
          <div className="ca-block-head"><h2>全部角色</h2><span className="ca-block-sub">{grid.length} 个角色</span></div>
          <HomeGrid characters={grid} />
        </section>
      </div>
    </div>
  );
}
