import Link from 'next/link';
import { CharacterCover } from '@/components/character-cover';

type Item = { id: string; name: string; author: string; initial: string; hue: number; hook: string; chats: string; ownerId: number | null };

// 影院视图首页：海报墙 + 一句话钩子，对齐原型的 cinema home
export function CinemaHome({ characters, userName, returning = false }: { characters: Item[]; userName?: string; returning?: boolean }) {
  return (
    <div className="cinema-home">
      <header className="cinema-curtain">
        <span>酒馆 · 放映</span>
        <h1>{returning ? '欢迎回来' : '欢迎来到酒馆'}，{userName ?? '旅人'}</h1>
        <p>挑一部片，开始今晚的故事。</p>
      </header>
      <div className="cinema-grid">
        {characters.map((character) => (
          <Link key={character.id} className="cinema-poster" href={`/c/${character.id}`}>
            <div className="cinema-poster-cover">
              <CharacterCover character={character} fill />
              <div className="cinema-poster-fade" />
              <div className="cinema-poster-caption">
                <strong>{character.name}</strong>
                <span>{character.hook}</span>
              </div>
            </div>
            <div className="cinema-poster-meta"><span>@{character.author}</span><span>{character.chats} 人聊过</span></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
