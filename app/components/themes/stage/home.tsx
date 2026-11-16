import Link from 'next/link';
import type { CSSProperties } from 'react';
import type { CharacterView } from '@/lib/characters';
import type { HomeData } from '@/components/themes/types';
import { coverUrl } from '@/components/themes/types';
import { RpText } from '@/components/rp-text';
import { StageArt } from '@/components/themes/stage/art';
import { Tilt } from '@/components/themes/stage/tilt';
import { DeckDraw } from '@/components/themes/stage/deck';
import { StageCollection, type ShelfCard } from '@/components/themes/stage/collection';
import { bigCount, categoryLine, giantSize, pad2, parseCount, plain, shortPace, stampCount } from '@/components/themes/stage/util';

// 戏台 STAGE：角色是卡，聊天是一场戏。
// 便当格主视觉（倾斜主推卡 + 超大名字）、今日剧本、数据格、抽一张、心情贴纸、卡册。
export function StageHome({ data }: { data: HomeData }) {
  const all = data.all;
  const featured = data.featured ?? all[0];
  const number = (character: CharacterView) => all.findIndex((c) => c.id === character.id) + 1;

  // 今日剧本：按日期在其余有立绘的角色里轮换（服务端算，避免水合差异）
  const now = new Date();
  const dayOfYear = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(now.getFullYear(), 0, 0)) / 86400000);
  const pool = data.showcase.filter((c) => c.id !== featured?.id);
  const script = pool.length ? pool[dayOfYear % pool.length] : undefined;
  const backCard = pool.find((c) => c.id !== script?.id) ?? pool[0];

  const openings = all.reduce((sum, c) => sum + parseCount(c.chats), 0);
  const big = bigCount(openings);
  const bars = all.map((c) => parseCount(c.chats)).sort((a, b) => a - b);
  const maxBar = Math.max(1, ...bars);

  const deckCards = (data.showcase.length > 1 ? data.showcase : all).map((c) => ({
    id: c.id, name: c.name, initial: c.initial, ownerId: c.ownerId, coverImage: c.coverImage, hook: c.hook,
  }));
  const deckStart = Math.max(0, deckCards.findIndex((c) => c.id !== featured?.id && c.id !== script?.id));

  const shelf: ShelfCard[] = all.map((c, i) => ({
    id: c.id, no: i + 1, name: c.name, initial: c.initial, author: c.author, ownerId: c.ownerId, coverImage: c.coverImage,
    category: c.category, tags: c.tags, nsfw: c.nsfw, chats: c.chats, hook: c.hook, pace: c.pace, createdAt: c.createdAt,
  }));

  const firstGreeting = featured ? featured.greeting.replace(/\r\n/g, '\n').split(/\n{2,}/)[0] : '';

  return (
    <div className="p-inner stg-home">
      <section className="stg-bento" aria-label="今夜主演">
        {featured ? (
          <article className="stg-tile stg-feat stg-rise" style={{ animationDelay: '.05s' }}>
            <div className="stg-sheen" aria-hidden="true" />
            <div className="stg-feat-meta">
              <div className="stg-serial"><span className="stg-dot" /><b>NO.{pad2(number(featured))}</b> 今夜主演 · {featured.category} · 作者 {featured.author}</div>
              <h2><span className="stg-ital">Tonight&apos;s lead —</span>{featured.hook}</h2>
              <blockquote className="stg-quote"><RpText text={firstGreeting} /></blockquote>
              <div className="stg-facts">
                <div><b>{featured.chats}</b>次开场</div>
                <div><b>{shortPace(featured.pace)}</b>叙事节奏</div>
                <div><b>{featured.nsfw ? '18+' : '全年龄'}</b>分级</div>
              </div>
              <div className="stg-row">
                <Link className="stg-btn stg-btn--indigo" href={`/c/${featured.id}`}>开场 <span aria-hidden="true">→</span></Link>
                <a className="stg-btn stg-btn--ghost" href="#stg-shelf">翻翻卡册</a>
              </div>
            </div>

            <Tilt className="stg-portrait" strength={0.9}>
              {backCard && (
                <div className="stg-pcard stg-pcard--back" aria-hidden="true">
                  <div className="stg-pcard-img"><StageArt character={backCard} /></div>
                </div>
              )}
              <Link className="stg-pcard stg-pcard--main" href={`/c/${featured.id}`} aria-label={`${featured.name} 的角色卡`}>
                <div className="stg-pcard-img">
                  <StageArt character={featured} position="40% 28%" />
                  <span className="stg-glare" aria-hidden="true" />
                </div>
                <div className="stg-pcard-cap"><span>NO.{pad2(number(featured))} · {featured.category}</span><span className="stg-ital">by {featured.author}</span></div>
              </Link>
              <div className="stg-stamp" aria-label={`${featured.chats} 次开场`}>
                <svg viewBox="0 0 92 92" aria-hidden="true">
                  <defs><path id="stg-stamp-path" d="M46,46 m-34,0 a34,34 0 1,1 68,0 a34,34 0 1,1 -68,0" /></defs>
                  <text fontSize="8.5" fill="#fff" letterSpacing="2.6"><textPath href="#stg-stamp-path">· 今夜热演 · TONIGHT ON STAGE </textPath></text>
                </svg>
                <div><span>{stampCount(featured.chats)}</span><br />开场</div>
              </div>
            </Tilt>

            <div className="stg-giant" aria-hidden="true" style={{ ['--giant' as string]: `${giantSize(featured.name, 236, 700)}px` } as CSSProperties}>
              <span className="stg-ital">{categoryLine(featured.category)}</span>
              {featured.name}
            </div>
          </article>
        ) : (
          <article className="stg-tile stg-feat stg-feat--empty">
            <div className="stg-feat-meta">
              <h2><span className="stg-ital">The stage is empty —</span>还没有角色上台。</h2>
              <div className="stg-row"><Link className="stg-btn stg-btn--indigo" href="/create">创建第一个角色 →</Link></div>
            </div>
          </article>
        )}

        <div className="stg-rcol">
          {script ? (
            <article className="stg-tile stg-script stg-rise" style={{ animationDelay: '.15s' }}>
              <StageArt character={script} className="stg-script-bg" position="50% 22%" />
              <div className="stg-script-top"><b><i />今日剧本 · DAY {dayOfYear}</b><span>23:59 换场</span></div>
              <div className="stg-glass">
                <span className="stg-ital">Today&apos;s script</span>
                <h3>{script.hook.split(/[，,。！？!?]/)[0]}</h3>
                <p>{plain(script.greeting)}</p>
                <div className="stg-cast">
                  <StageArt character={script} position="50% 15%" />
                  <i className="stg-me">你</i>
                  <span>{script.name} × 你</span>
                  <Link className="stg-go" href={`/c/${script.id}`}>入戏 <span aria-hidden="true">→</span></Link>
                </div>
              </div>
              {script.tags.length > 0 && <div className="stg-chip-w">{script.tags.slice(0, 2).join(' · ')}</div>}
            </article>
          ) : (
            <article className="stg-tile stg-script stg-script--empty">
              <div className="stg-glass"><span className="stg-ital">Today&apos;s script</span><h3>今晚的剧本还在写</h3><p>去广场看看大家都在演什么。</p><div className="stg-cast"><Link className="stg-go" href="/plaza">去广场 →</Link></div></div>
            </article>
          )}

          <div className="stg-duo">
            <article className="stg-tile stg-stats stg-rise" style={{ animationDelay: '.25s' }}>
              <div className="stg-lab"><span>累计开场</span><span>ALL</span></div>
              <div className="stg-num">{big.value}<small>{big.unit}</small></div>
              <span className="stg-delta">{pad2(all.length)} 张角色卡</span>
              <div className="stg-bars" aria-hidden="true">
                {bars.map((value, i) => (
                  <i key={i} className={i >= bars.length - Math.min(3, Math.ceil(bars.length / 3)) ? 'is-hi' : ''} style={{ height: `${Math.max(10, (value / maxBar) * 100)}%`, animationDelay: `${0.4 + i * 0.05}s` }} />
                ))}
              </div>
              <div className="stg-ital">openings across the collection</div>
            </article>
            <DeckDraw cards={deckCards} initial={deckStart} />
          </div>
        </div>
      </section>

      <StageCollection cards={shelf} categories={data.categories} />

      {data.chats.length > 0 && (
        <section className="stg-continue" aria-label="接着演">
          <div className="stg-sec-h"><h2>接着演</h2><span className="stg-ital">the show goes on</span><Link className="stg-more" href="/chats">全部对话 →</Link></div>
          <div className="stg-tickets">
            {data.chats.map((chat, i) => {
              const owner = all.find((c) => c.id === chat.characterId);
              const src = coverUrl({ id: chat.characterId, coverImage: owner?.coverImage ?? null, ownerId: chat.characterOwner });
              return (
                <Link key={chat.id} className="stg-ticket stg-rise" href={`/chats/${chat.id}`} style={{ animationDelay: `${0.1 + i * 0.06}s`, ['--rot' as string]: i % 2 ? '.8deg' : '-.8deg' }}>
                  <span className="stg-ticket-ph">
                    <StageArt character={{ id: chat.characterId, name: chat.characterName, initial: chat.characterInitial, ownerId: chat.characterOwner }} src={src} position="50% 18%" />
                  </span>
                  <span className="stg-ticket-main">
                    <span className="stg-ticket-top"><b>{chat.characterName}</b><small>{chat.title}</small></span>
                    <span className="stg-ticket-last">{plain(chat.lastMessage) || '还没有台词，去写下第一句。'}</span>
                  </span>
                  <span className="stg-ticket-stub"><b>{chat.messageCount}</b><small>回合</small><em>续演 →</em></span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <footer className="stg-foot"><b>酒馆</b><span>角色是卡，故事是戏台</span><span className="stg-ital">the stage</span></footer>
    </div>
  );
}
