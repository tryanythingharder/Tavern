import Link from 'next/link';
import { HomeGrid } from '@/components/home-grid';
import { ProtoAvatar, ProtoCover } from '@/components/proto-cover';
import { HomeHero } from '@/components/home-hero';
import type { HomeData } from '@/components/themes/types';

const ARROW = (
  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
);

// 原首页布局（重设计第一版）。主题组件可直接复用，或完全自绘。
export function HomeClassic({ data }: { data: HomeData }) {
  return (
    <div className="p-inner">
      <div className="ca-home">
        <HomeHero
          characters={data.showcase}
          greeting={`${data.returning ? '欢迎回来' : '欢迎来到夜话'}，${data.userName ?? '旅人'}`}
          sub={data.returning ? '今天想和谁说说话？' : '挑一个角色，写下第一句。'}
        />

        <section className="ca-block">
          <div className="ca-block-head"><h2>为您推荐</h2><Link href="/plaza">查看全部 {ARROW}</Link></div>
          <div className="ca-rec-row">
            {data.recs.map((character) => (
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
            {data.grid.filter((c) => c.id !== data.featured?.id).slice(0, 5).map((character) => (
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

        {data.chats.length > 0 && (
          <section className="ca-block">
            <div className="ca-block-head"><h2>继续上次的故事</h2><Link href="/chats">全部对话 {ARROW}</Link></div>
            <div className="ca-chat-list">
              {data.chats.map((chat) => {
                const cover = {
                  id: chat.characterId,
                  name: chat.characterName,
                  initial: chat.characterInitial,
                  hue: chat.characterHue,
                  ownerId: chat.characterOwner,
                };
                return (
                  <Link className="p-continue-card" href={`/chats/${chat.id}`} key={chat.id}>
                    <ProtoAvatar character={cover} size={40} />
                    <span className="p-continue-text">
                      <span className="p-continue-name">{chat.characterName}<span className="p-continue-time"> · {chat.title}</span></span>
                      <span className="p-continue-last">{chat.lastMessage ?? '还没有消息'}</span>
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
            {data.rooms.map((room) => (
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
          <div className="ca-block-head"><h2>全部角色</h2><span className="ca-block-sub">{data.grid.length} 个角色</span></div>
          <HomeGrid characters={data.grid} />
        </section>
      </div>
    </div>
  );
}
