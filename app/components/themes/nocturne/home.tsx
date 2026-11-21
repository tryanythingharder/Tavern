import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { CharacterView } from '@/lib/characters';
import { coverUrl, type HomeData } from '@/components/themes/types';
import { NocChapterRail, NocDeck, NocProgramme, NocTimecode } from '@/components/themes/nocturne/parts';
import { actInfo, cnNumber, lastLine, pad2, plain } from '@/components/themes/nocturne/lib';

// 夜幕 NOCTURNE：每个角色是一部电影，酒馆是一座夜场影院。
// 01 放映中（主视觉） / 02 今夜档期（3D 海报扇） / 03 片单 / 04 续看 / 片尾字幕
export function NocturneHome({ data }: { data: HomeData }) {
  const featured = data.featured;
  const featuredCover = featured ? coverUrl(featured) : null;
  const deck = data.showcase.filter((character) => character.id !== featured?.id).slice(0, 5);
  const byId = new Map(data.all.map((character) => [character.id, character]));
  const resume = data.chats.slice(0, 3);
  const authors = Array.from(new Set(data.all.map((character) => character.author))).slice(0, 6);
  const total = data.all.length;
  const firstLine = featured ? lastLine(featured.greeting) : null;

  return (
    <div className="p-inner noc-home">
      <div className="noc-grain" aria-hidden="true" />
      <div className="noc-vignette" aria-hidden="true" />
      <NocChapterRail
        items={[
          { id: 'noc-now', label: '放映中' },
          ...(deck.length ? [{ id: 'noc-billing', label: '今夜档期' }] : []),
          { id: 'noc-programme', label: '片单' },
          ...(resume.length ? [{ id: 'noc-continue', label: '续看' }] : []),
        ]}
      />

      {/* 01 放映中 */}
      <section className="noc-hero" id="noc-now" aria-label="今夜放映">
        {featuredCover && <div className="noc-hero-plate" style={{ backgroundImage: `url(${featuredCover})` }} aria-hidden="true" />}
        <div className="noc-hero-still" aria-hidden="true">
          {featuredCover ? <img src={featuredCover} alt="" /> : <div className="noc-hero-blank">{featured?.initial ?? '酒'}</div>}
        </div>
        <div className="noc-bar noc-bar--top" aria-hidden="true">
          <span><i className="noc-rec" />放映厅 · 第 1 号 · 夜场</span>
          <span>2.39 : 1 · 35mm</span>
        </div>
        <div className="noc-bar noc-bar--bot" aria-hidden="true">
          <span>夜话影业 出品</span>
          <span>今夜共 {total} 部在映</span>
        </div>

        <div className="noc-hero-meta" aria-hidden="true">
          <span className="noc-caps">REEL <b className="noc-latin">01 / {pad2(Math.max(1, data.showcase.length))}</b></span>
          <NocTimecode />
        </div>

        {featured ? (
          <div className="noc-hero-in">
            <div className="noc-kicker"><span className="noc-kicker-dot" /><span className="noc-caps">{data.returning ? `欢迎回来，${data.userName ?? '旅人'}` : 'Now Showing'} · 今夜放映 · {featured.category}</span></div>
            <h1 className="noc-title" aria-label={featured.name}>
              {Array.from(featured.name).map((ch, index) => (
                <span key={index} style={{ ['--i' as string]: index } as CSSProperties} aria-hidden="true">{ch}</span>
              ))}
            </h1>
            <p className="noc-tagline">{plain(featured.hook)}</p>
            <dl className="noc-credits">
              <div><dt>作者</dt><dd>{featured.author}</dd></div>
              <div><dt>片长</dt><dd>{featured.pace || '—'}</dd></div>
              <div><dt>观众</dt><dd>{featured.chats} 人次</dd></div>
              <div><dt>类型</dt><dd>{featured.category}</dd></div>
            </dl>
            <div className="noc-ctas">
              <Link className="noc-btn noc-btn--primary" href={`/c/${featured.id}`}><span className="noc-play" aria-hidden="true" />开场</Link>
              <a className="noc-btn noc-btn--ghost" href="#noc-programme">浏览片单</a>
              <div className="noc-tags">
                {featured.nsfw && <span className="is-r">R18</span>}
                {featured.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="noc-hero-in">
            <h1 className="noc-title"><span>酒</span><span>馆</span></h1>
            <p className="noc-tagline">今夜还没有片子上映。去创作一个角色吧。</p>
            <div className="noc-ctas"><Link className="noc-btn noc-btn--primary" href="/create"><span className="noc-play" aria-hidden="true" />创作</Link></div>
          </div>
        )}

        {featured && firstLine?.line && (
          <div className="noc-hero-side">
            <p className="noc-caps">第一句台词</p>
            <p className="noc-hero-quote">
              {firstLine.lead && <span>{clip(firstLine.lead, 38)}<br /></span>}
              <b>{clip(firstLine.line, 46)}</b>
            </p>
          </div>
        )}
      </section>

      {/* 02 今夜档期 */}
      {deck.length > 0 && (
        <section className="noc-billing" id="noc-billing" aria-label="今夜档期">
          <div className="noc-billing-copy noc-reveal">
            <div className="noc-chap"><span className="noc-chap-n noc-latin">02</span><span className="noc-chap-rule" /><span className="noc-caps">今夜档期 · Tonight’s Bill</span></div>
            <h2 className="noc-display">每个角色，<br />都是一部<br /><span className="noc-dim">电影。</span></h2>
            <p className="noc-lede">灯暗下来之后，故事才开始。选一个人，坐进他的雨夜、山门或谈判桌——剩下的剧本，由你来写。</p>
          </div>
          <NocDeck
            cards={deck.map((character, index) => ({
              id: character.id,
              name: character.name,
              cover: coverUrl(character),
              initial: character.initial,
              hook: plain(character.hook),
              category: character.category,
              author: character.author,
              nsfw: character.nsfw,
              no: index + 2,
            }))}
          />
        </section>
      )}

      {/* 03 片单 */}
      <section className="noc-programme" id="noc-programme" aria-label="全部片单">
        <NocProgramme
          categories={data.categories}
          items={data.all.map((character, index) => posterItem(character, index))}
        />
      </section>

      {/* 04 续看 */}
      {resume.length > 0 && (
        <section className="noc-cont" id="noc-continue" aria-label="续看">
          <div className="noc-chap noc-reveal"><span className="noc-chap-n noc-latin">04</span><span className="noc-chap-rule" /><span className="noc-caps">续看 · Resume Screening</span></div>
          <div className="noc-cont-head noc-reveal">
            <h2>灯还亮着，故事停在这里。</h2>
            <Link className="noc-link" href="/chats">全部对话 →</Link>
          </div>
          <div className="noc-reels">
            {resume.map((chat) => {
              const character = byId.get(chat.characterId);
              const cover = coverUrl({ id: chat.characterId, coverImage: character?.coverImage, ownerId: chat.characterOwner });
              const info = actInfo(chat.messageCount);
              return (
                <Link className="noc-reel noc-reveal" href={`/chats/${chat.id}`} key={chat.id}>
                  <div className="noc-reel-img">
                    {cover ? <img src={cover} alt="" /> : <div className="noc-reel-blank">{chat.characterInitial}</div>}
                    <span className="noc-reel-play" aria-hidden="true" />
                    <div className="noc-reel-ov">
                      <span className="noc-caps">第{cnNumber(info.act)}幕 · {chat.title}</span>
                      <h3>{chat.characterName}</h3>
                    </div>
                  </div>
                  <div className="noc-reel-body">
                    <p className="noc-reel-last">{plain(chat.lastMessage) || '还没有消息，回到开场继续。'}</p>
                    <div className="noc-progress">
                      <span className="noc-track"><i style={{ width: `${Math.round(info.progress * 100)}%` }} /></span>
                      <span className="noc-progress-t"><b>第 {info.turn} 回合</b> · {chat.messageCount} 条</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 片尾字幕 */}
      <footer className="noc-roll">
        <p className="noc-fin noc-latin">— fin —</p>
        <dl>
          <dt>出品</dt><dd>夜话</dd>
          <dt>放映</dt><dd>{total} 部在映 · 每夜更新</dd>
          {authors.length > 0 && (<><dt>作者</dt><dd>{authors.join(' · ')}</dd></>)}
          <dt>主演</dt><dd>{data.userName ?? '你'}</dd>
          <dt>放映厅</dt><dd><Link href="/rooms">多角色房间{data.rooms.length ? ` · ${data.rooms.length} 间` : ''} →</Link></dd>
        </dl>
        <p className="noc-end">散 场</p>
        <p className="noc-end-sub">灯亮之前，故事都还算数。</p>
      </footer>
    </div>
  );
}

function clip(text: string, max: number) {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

function posterItem(character: CharacterView, index: number) {
  return {
    id: character.id,
    name: character.name,
    author: character.author,
    category: character.category,
    pace: character.pace,
    chats: character.chats,
    nsfw: character.nsfw,
    hook: plain(character.hook),
    greeting: clip(plain(character.greeting), 90),
    cover: coverUrl(character),
    initial: character.initial,
    no: index + 1,
  };
}
