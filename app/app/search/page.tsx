import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { listCharacterViews, searchCharacterViews } from '@/lib/characters';
import { ALL, CATEGORIES, HOT_TAG_COUNT, hotTags, isCategory } from '@/lib/catalog';
import { searchAuthors } from '@/lib/authors';
import { getCurrentUser } from '@/lib/auth';
import { getBlockedAuthors } from '@/lib/blocked';
import { nsfwAccess } from '@/lib/age-gate';
import { ProtoWorkCard } from '@/components/proto-work-card';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '搜索' });
}
export const dynamic = 'force-dynamic';

const SORTS: { value: 'relevance' | 'hot' | 'new'; label: string }[] = [
  { value: 'relevance', label: '相关' },
  { value: 'hot', label: '最热' },
  { value: 'new', label: '最新' },
];

function formatChats(value: number): string {
  return value >= 10000 ? `${(value / 10000).toFixed(1)} 万` : String(value);
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; category?: string; tag?: string | string[]; sort?: string; view?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? '').trim();
  const type = params.type === 'character' || params.type === 'author' ? params.type : 'all';
  const category: string = isCategory(params.category) ? params.category : ALL;
  const tags = [...new Set((Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 8);
  const sort = SORTS.some((item) => item.value === params.sort) ? (params.sort as 'relevance' | 'hot' | 'new') : 'relevance';
  const view = params.view === 'list' ? 'list' : 'grid';
  const user = await getCurrentUser();
  const hide = !(await nsfwAccess(user?.id ?? null)).show;
  const blocked = await getBlockedAuthors();

  // 有关键词时在结果里筛；没有关键词但选了题材或标签时，直接按筛选条件浏览
  const filtering = category !== ALL || tags.length > 0;
  const active = Boolean(query) || filtering;
  const characters = active
    ? searchCharacterViews(query, { hideNsfw: hide, category, tags, sort }).filter((item) => !blocked.includes(item.author))
    : [];
  // 热门标签：按当前题材统计全部公开角色的 tags，取前 N 个；已选的保留显示
  const tagScope = listCharacterViews(category, { hideNsfw: hide }).filter((item) => !blocked.includes(item.author));
  const topTags = hotTags(tagScope, HOT_TAG_COUNT).map((item) => item.tag);
  const tagChips = [...tags.filter((tag) => !topTags.includes(tag)), ...topTags];
  const authorMatches = query ? searchAuthors(query, { hideNsfw: hide }).filter((item) => !blocked.includes(item.name)) : [];
  const authors = sort === 'hot'
    ? [...authorMatches].sort((a, b) => b.chats - a.chats)
    : sort === 'new'
      ? [...authorMatches].sort((a, b) => b.latest - a.latest)
      : authorMatches;
  const characterCount = characters.length;
  const authorCount = authors.length;
  const total = characterCount + authorCount;
  const showCharacters = type !== 'author';
  const showAuthors = type !== 'character';

  const href = (patch: Partial<{ type: string; category: string; sort: string; view: string; tags: string[] }>) => {
    const next = { type, category, sort, view, tags, ...patch };
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (next.type !== 'all') search.set('type', next.type);
    if (next.category !== ALL) search.set('category', next.category);
    for (const tag of next.tags) search.append('tag', tag);
    if (next.sort !== 'relevance') search.set('sort', next.sort);
    if (next.view !== 'grid') search.set('view', next.view);
    const suffix = search.toString();
    return `/search${suffix ? `?${suffix}` : ''}`;
  };

  return (
    <div className="p-inner">
      <header className="p-page-title">
        <div>
          <h1>搜索</h1>
          <p>{query ? `“${query}” · 角色 ${characterCount} · 作者 ${authorCount}` : filtering ? `按筛选浏览 · 角色 ${characterCount}` : '搜索角色、作者或剧情关键词。'}</p>
        </div>
      </header>

      <div className="p-filterbar">
        <form className="p-filterbar-main" action="/search">
          <label className="p-search">
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input className="p-input" name="q" defaultValue={query} placeholder="搜索角色、作者或剧情" aria-label="搜索" />
          </label>
          <button className="p-btn p-btn--primary" type="submit">搜索</button>
          {type !== 'all' && <input type="hidden" name="type" value={type} />}
          {category !== ALL && <input type="hidden" name="category" value={category} />}
          {tags.map((tag) => <input key={tag} type="hidden" name="tag" value={tag} />)}
          {sort !== 'relevance' && <input type="hidden" name="sort" value={sort} />}
          {view !== 'grid' && <input type="hidden" name="view" value={view} />}
        </form>

        <div className="search-tools">
          <div className="search-types search-tool">
            <span className="search-tool-label">类型</span>
            <div className="p-chips" role="tablist" aria-label="结果类型">
              <Link className="p-chip" role="tab" aria-selected={type === 'all'} aria-current={type === 'all' ? 'page' : undefined} href={href({ type: 'all' })}>全部{query ? ` ${total}` : ''}</Link>
              <Link className="p-chip" role="tab" aria-selected={type === 'character'} aria-current={type === 'character' ? 'page' : undefined} href={href({ type: 'character' })}>角色{query ? ` ${characterCount}` : ''}</Link>
              <Link className="p-chip" role="tab" aria-selected={type === 'author'} aria-current={type === 'author' ? 'page' : undefined} href={href({ type: 'author' })}>作者{query ? ` ${authorCount}` : ''}</Link>
            </div>
          </div>
          {type !== 'author' && (
            <div className="search-categories search-tool">
              <span className="search-tool-label">题材</span>
              <div className="p-chips plaza-categories" aria-label="题材">
                {[ALL, ...CATEGORIES].map((item) => (
                  <Link key={item} className="p-chip" aria-current={category === item ? 'page' : undefined} href={href({ category: item })}>{item}</Link>
                ))}
              </div>
            </div>
          )}
          {type !== 'author' && tagChips.length > 0 && (
            <div className="search-tags search-tool">
              <span className="search-tool-label">标签</span>
              <div className="p-chips plaza-tags" aria-label="热门标签">
                {tagChips.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <Link key={tag} className="p-chip" aria-current={on ? 'page' : undefined} href={href({ tags: on ? tags.filter((item) => item !== tag) : [...tags, tag] })}>#{tag}</Link>
                  );
                })}
                {tags.length > 0 && <Link className="p-text-btn" href={href({ tags: [] })}>清除标签</Link>}
              </div>
            </div>
          )}
          <div className="search-tools-actions">
            <div className="search-tool">
              <span className="search-tool-label">排序</span>
              <div className="p-chips search-sort" aria-label="排序">
                {SORTS.map((item) => (
                  <Link key={item.value} className="p-chip" aria-current={sort === item.value ? 'page' : undefined} href={href({ sort: item.value })}>{item.label}</Link>
                ))}
              </div>
            </div>
            <div className="search-tool">
              <span className="search-tool-label">视图</span>
              <div className="p-chips search-view" aria-label="视图">
                <Link className="p-chip" aria-current={view === 'grid' ? 'page' : undefined} href={href({ view: 'grid' })}>卡片</Link>
                <Link className="p-chip" aria-current={view === 'list' ? 'page' : undefined} href={href({ view: 'list' })}>列表</Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!active && (
        <div className="p-empty">
          <div className="p-empty-title">从一个名字或一句设定开始</div>
          <p className="p-empty-text">搜角色名、作者名、题材或剧情关键词。比如「沈砚之」「民国」「慢热」。</p>
          <Link className="p-btn p-btn--primary" href="/plaza">去广场看看</Link>
        </div>
      )}

      {active && total === 0 && (
        <div className="p-empty">
          <div className="p-empty-title">没有匹配的角色或作者</div>
          <p className="p-empty-text">换个关键词，或去广场按题材浏览。</p>
          <Link className="p-btn p-btn--primary" href="/plaza">去广场看看</Link>
        </div>
      )}

      {active && showCharacters && characterCount > 0 && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>角色</h2>
            <span className="p-section-sub">{characterCount} 个</span>
          </div>
          <div className={`p-work-grid${view === 'list' ? ' is-list' : ''}`}>
            {characters.map((character) => <ProtoWorkCard key={character.id} character={character} />)}
          </div>
        </section>
      )}

      {query && showAuthors && authorCount > 0 && (
        <section className="p-section">
          <div className="p-section-head">
            <h2>作者</h2>
            <span className="p-section-sub">{authorCount} 位</span>
          </div>
          <div className={`p-author-results${view === 'list' ? ' is-list' : ''}`}>
            {authors.map((author) => (
              <Link className="p-card p-author-result" href={`/a/${encodeURIComponent(author.name)}`} key={author.name}>
                <span className={`p-avatar${author.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '48px', ['--h' as string]: author.hue }}>{author.avatar ? <img src={author.avatar} alt="" loading="lazy" /> : Array.from(author.name)[0]}</span>
                <span className="p-author-result-main">
                  <strong>{author.name}</strong>
                  <span className="p-small">@{author.name} · {author.works} 个公开作品 · {formatChats(author.chats)} 人聊过</span>
                  {author.bio && <span className="p-author-result-bio">{author.bio}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
