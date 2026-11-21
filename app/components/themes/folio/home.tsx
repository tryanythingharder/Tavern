import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CharacterView } from '@/lib/characters';
import { coverUrl, type HomeData } from '@/components/themes/types';
import { FolioIndex, type FolioIndexItem } from '@/components/themes/folio/index-list';
import { FolioReveal } from '@/components/themes/folio/reveal';
import { cnYear, excerpt, formatCount, latinName, pad, parseCount, plain, roman, season, seasonEn } from '@/components/themes/folio/lib';

// 书页 FOLIO：首页是一本可以对话的文学季刊。
// 刊头 Masthead → 封面故事 CoverStory → 继续阅读 Bookmarks → 本期角色 IssueIndex → 版权页 Colophon

function Dialogue({ text }: { text: string }): ReactNode {
  // 「对白」加粗，其余保持正文
  const parts = text.split(/(「[^」]*」?)/g).filter(Boolean);
  return parts.map((part, i) => (part.startsWith('「') ? <q key={i}>{part}</q> : <span key={i}>{part}</span>));
}

export function FolioHome({ data }: { data: HomeData }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const issueNo = pad(month);
  const all = data.all;
  const totalChats = all.reduce((sum, character) => sum + parseCount(character.chats), 0);
  const cover = data.featured ?? data.showcase[0] ?? all[0];
  const coverIndex = cover ? all.findIndex((c) => c.id === cover.id) : -1;
  const coverSrc = cover ? coverUrl(cover) : null;
  const coverLatin = cover ? latinName(cover) : null;
  const nameChars = cover ? Array.from(cover.name) : [];
  const vnameSize = Math.min(186, Math.floor(560 / Math.max(nameChars.length, 3)));
  const alsoInside = all.filter((c) => c.id !== cover?.id).slice(0, 3);
  const coverTags = cover ? [cover.category, ...cover.tags.filter((t) => t !== cover.category)].slice(0, 3) : [];
  const byId = new Map(all.map((c) => [c.id, c] as const));
  const shelf = data.chats.slice(0, 3);
  const theme = topPace(all);

  const indexItems: FolioIndexItem[] = all.map((c) => ({
    id: c.id,
    name: c.name,
    author: c.author,
    category: c.category,
    hook: c.hook,
    chats: c.chats,
    nsfw: c.nsfw,
    pace: c.pace.split('·').slice(0, 2).join('·').trim(),
    cover: coverUrl(c),
    initial: c.initial,
  }));
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
  const categories = data.categories.filter((cat) => counts.has(cat)).map((cat) => ({ name: cat, count: counts.get(cat) ?? 0 }));
  const tags = topTags(all, 8);

  return (
    <div className="fo-home">
      <FolioReveal />
      {/* ───── Masthead ───── */}
      <header className="fo-mast">
        <div className="fo-issueline fo-rv" style={{ ['--d' as string]: 0 }}>
          <b>第 {cnNumber(month)} 期</b>
          <span>{cnYear(year)} · {season(month)}</span>
          <span className="fo-hide-m">本期主题：{theme ? `${theme}与未完成的故事` : '未完成的故事'}</span>
        </div>
        <div className="fo-masthead">
          <h1 className="fo-title" aria-label="夜话">
            <span style={{ ['--d' as string]: 120 }}>夜</span>
            <span style={{ ['--d' as string]: 220 }}>话</span>
          </h1>
          <div className="fo-mh-mid fo-rv" style={{ ['--d' as string]: 300 }}>
            <span className="fo-tagline">Yehua — a quarterly of characters</span>
            <p>一本可以对话的小说杂志。每一位角色都是一篇未写完的故事，等你翻开、落笔、续写。</p>
          </div>
          <div className="fo-issue fo-rv" style={{ ['--d' as string]: 380 }}>
            <div className="fo-issue-meta">
              <b>{season(month)}</b>
              <span>{pad(all.length)} 位角色</span>
              <span>{formatCount(totalChats)} 次对话</span>
            </div>
            <div className="fo-issue-no">No.{issueNo}</div>
          </div>
        </div>
        <div className="fo-rule2" />
      </header>

      {/* ───── Cover story ───── */}
      {cover && (
        <section className="fo-cover" aria-label="封面故事">
          <div className="fo-cv-text">
            <div className="fo-kicker fo-rv" style={{ ['--d' as string]: 450 }}>
              <span className="fo-it">§ I</span><span>封面故事</span><span className="fo-it">Cover Story</span>
            </div>
            <div className="fo-cv-cat fo-rv" style={{ ['--d' as string]: 520 }}>
              {coverTags.map((tag, i) => (
                <span key={tag}>{i > 0 && <i>/</i>}{tag}</span>
              ))}
            </div>
            <p className="fo-standfirst fo-rv" style={{ ['--d' as string]: 600 }}>{cover.hook}</p>
            {cover.greeting && (
              <blockquote className="fo-excerpt fo-rv" style={{ ['--d' as string]: 720 }}>
                <Dialogue text={excerpt(cover.greeting, 84)} />
              </blockquote>
            )}
            <dl className="fo-byline fo-rv" style={{ ['--d' as string]: 820 }}>
              <dt>文</dt><dd>{cover.author}</dd>
              {cover.pace && (<><dt>调性</dt><dd>{cover.pace}</dd></>)}
              {cover.description && (<><dt>人设</dt><dd className="fo-dim">{excerpt(cover.description, 40)}</dd></>)}
            </dl>
            {alsoInside.length > 0 && (
              <div className="fo-lines fo-rv" style={{ ['--d' as string]: 900 }}>
                <div className="fo-lines-h"><span>本期另见</span><span className="fo-it">Also inside</span></div>
                {alsoInside.map((c) => {
                  const n = all.findIndex((x) => x.id === c.id) + 1;
                  return (
                    <Link key={c.id} href={`/c/${c.id}`}>
                      <span className="fo-it">{pad(n)}</span>
                      <b>{c.name}</b>
                      <span className="fo-t">{plain(c.hook)}</span>
                      <span className="fo-pg fo-it">p.{pad(n * 7)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="fo-cta-row fo-rv" style={{ ['--d' as string]: 980 }}>
              <Link className="fo-btn" href={`/c/${cover.id}`}><span>翻开第一章</span><span className="fo-arr" aria-hidden="true">→</span></Link>
              <Link className="fo-link" href="/plaza">翻阅广场</Link>
            </div>
          </div>

          <figure className="fo-cv-photo">
            <Link className="fo-frame" href={`/c/${cover.id}`} aria-label={`翻开 ${cover.name}`}>
              {coverSrc ? <img src={coverSrc} alt={`${cover.name}的立绘`} /> : <span className="fo-frame-initial" aria-hidden="true">{cover.initial}</span>}
              <span className="fo-folio">p. {pad(Math.max(coverIndex, 0) + 1)}</span>
              <span className="fo-stamp">{cover.chats} 次对话</span>
            </Link>
            <figcaption className="fo-rv" style={{ ['--d' as string]: 1100 }}>
              <span><span className="fo-it">Plate {roman(1, true)}.</span>　{cover.name}，{plain(cover.hook).slice(0, 18)}{plain(cover.hook).length > 18 ? '…' : ''}</span>
              <span>角色卡 · {cover.author}</span>
            </figcaption>
          </figure>

          <div className="fo-cv-name">
            <h2 className="fo-vname" aria-label={cover.name} style={{ ['--vs' as string]: `${vnameSize}px` }}>
              {nameChars.map((ch, i) => (
                <span key={i} style={{ ['--d' as string]: 500 + i * 120 }}>{ch}</span>
              ))}
            </h2>
            <div className="fo-vside fo-rv" style={{ ['--d' as string]: 900 }}>
              {coverLatin ? <span className="fo-roman">{coverLatin}</span> : <span />}
              <div className="fo-stat"><b>{formatCount(parseCount(cover.chats))}</b><span>次对话翻开</span></div>
            </div>
          </div>
        </section>
      )}

      {/* ───── Continue reading ───── */}
      {shelf.length > 0 && (
        <section className="fo-continue" aria-labelledby="fo-continue-h">
          <div className="fo-sh fo-reveal">
            <div className="fo-sec"><span className="fo-it">§ II</span><span className="fo-lat">Bookmarks</span></div>
            <h2 id="fo-continue-h">继续阅读</h2>
            <div className="fo-aside">夹着书签的 {pad(shelf.length)} 个故事<br /><Link href="/chats">全部对话 →</Link></div>
          </div>
          <div className="fo-shelf" data-count={shelf.length}>
            {shelf.map((chat, i) => {
              const character = byId.get(chat.characterId) as CharacterView | undefined;
              const src = coverUrl({ id: chat.characterId, coverImage: character?.coverImage ?? null, ownerId: chat.characterOwner });
              const progress = Math.max(6, Math.min(100, Math.round((chat.messageCount / 40) * 100)));
              const chapter = Math.max(1, Math.ceil(chat.messageCount / 12));
              return (
                <Link className="fo-bm fo-reveal" key={chat.id} href={`/chats/${chat.id}`} style={{ ['--d' as string]: i * 120 }}>
                  {src ? <img src={src} alt="" /> : <span className="fo-bm-initial" aria-hidden="true">{chat.characterInitial}</span>}
                  <div className="fo-bm-main">
                    <div className="fo-ch"><span>第{cnNumber(chapter)}章 · {chat.title}</span><span className="fo-it">p. {pad(chat.messageCount)}</span></div>
                    <h3>{chat.characterName}{character?.hook && <small>{character.category}</small>}</h3>
                    <p>{chat.lastMessage ? plain(chat.lastMessage) : '还没有落笔，翻开写下第一句。'}</p>
                  </div>
                  <span className="fo-go">继续 →</span>
                  <span className="fo-prog" aria-hidden="true"><i style={{ ['--p' as string]: `${progress}%` }} /></span>
                </Link>
              );
            })}
            {shelf.length < 3 && (
              <Link className="fo-bm fo-bm-blank fo-reveal" href="/plaza" style={{ ['--d' as string]: shelf.length * 120 }}>
                <span className="fo-bm-initial" aria-hidden="true">＋</span>
                <div className="fo-bm-main">
                  <div className="fo-ch"><span>空白书签</span><span className="fo-it">p. 00</span></div>
                  <h3>翻开新的一册</h3>
                  <p>去广场挑一位角色，从第一章写起。</p>
                </div>
                <span className="fo-go">去广场 →</span>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ───── Issue index ───── */}
      <section className="fo-issue-sec" aria-labelledby="fo-index-h">
        <div className="fo-sh fo-reveal">
          <div className="fo-sec"><span className="fo-it">§ {shelf.length ? 'III' : 'II'}</span><span className="fo-lat">In this issue</span></div>
          <h2 id="fo-index-h">本期角色</h2>
          <div className="fo-aside">{cnNumber(all.length)}篇未写完的故事<br />按目录翻阅，或直接落笔</div>
        </div>
        <FolioIndex items={indexItems} categories={categories} tags={tags} theme={theme} issueNo={issueNo} />
      </section>

      {/* ───── Colophon ───── */}
      <footer className="fo-colophon">
        <div className="fo-c1">夜话<span className="fo-it">Yehua, No.{issueNo} — {seasonEn(month)} {year}</span></div>
        <div className="fo-c2"><b>版权页</b>主编 · 夜话编辑部<br />角色作者保留其作品署名权</div>
        <div className="fo-c3"><b>排印</b>正文 思源宋体 · 界面 思源黑体<br />拉丁 Instrument Serif · Newsreader</div>
        <div className="fo-c4"><b>投稿</b><Link href="/create">投一张角色卡 →</Link><br /><Link href="/plaza">翻阅广场</Link></div>
      </footer>
    </div>
  );
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
function cnNumber(n: number): string {
  if (n <= 10) return CN_NUM[n] ?? String(n);
  if (n < 20) return `十${CN_NUM[n - 10]}`;
  if (n < 100) return `${CN_NUM[Math.floor(n / 10)]}十${n % 10 ? CN_NUM[n % 10] : ''}`;
  return String(n);
}

function topPace(all: CharacterView[]): string | null {
  const counts = new Map<string, number>();
  for (const c of all) {
    for (const word of c.pace.split(/[·・,，\s]+/).map((w) => w.trim()).filter(Boolean)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 1;
  for (const [word, n] of counts) if (n > max) { best = word; max = n; }
  return best;
}

function topTags(all: CharacterView[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const c of all) for (const tag of c.tags) if (tag !== c.category) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag);
}
