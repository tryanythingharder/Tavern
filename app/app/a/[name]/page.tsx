import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listCharacterViews } from '@/lib/characters';
import { nsfwAccess } from '@/lib/age-gate';
import { getBlockedAuthors } from '@/lib/blocked';
import { authorBio } from '@/lib/authors';
import { tr } from '@/lib/i18n/runtime';
import { NOINDEX, alternates, ogImage } from '@/lib/seo';
import { AuthorActions } from '@/components/author-actions';
import { ProtoWorkCard } from '@/components/proto-work-card';
import { getCurrentUser, profileMediaByName } from '@/lib/auth';
import { followerCount, isFollowing } from '@/lib/follows';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const author = decodeURIComponent(name);
  const works = listCharacterViews(undefined, { hideNsfw: true }).filter((c) => c.author === author);
  const description = (authorBio(author) || tr('{0} 在夜话发布的 {1} 个角色').replace('{0}', author).replace('{1}', String(works.length))).slice(0, 160);
  return {
    title: author,
    description,
    alternates: alternates(`/a/${encodeURIComponent(author)}`),
    robots: works.length ? undefined : NOINDEX,
    openGraph: { type: 'profile', title: author, description, images: [ogImage()] },
  };
}

function heat(value: string): number {
  const number = Number(String(value).replace(/[^\d.]/g, '')) || 0;
  return String(value).includes('万') ? number * 10000 : number;
}

export default async function AuthorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const author = decodeURIComponent(name);
  const viewerAccess = await nsfwAccess((await getCurrentUser())?.id ?? null);
  const works = listCharacterViews(undefined, { hideNsfw: !viewerAccess.allowed }).filter((character) => character.author === author);
  if (!works.length) notFound();
  const blocked = (await getBlockedAuthors()).includes(author);
  const totalChats = works.reduce((sum, character) => sum + heat(character.chats), 0);
  const joined = works.reduce((min, character) => (character.createdAt && (!min || character.createdAt < min) ? character.createdAt : min), 0);
  const joinedText = joined ? ` · 加入于 ${new Date(joined).getFullYear()} 年 ${new Date(joined).getMonth() + 1} 月` : '';
  const bio = authorBio(author);
  const media = profileMediaByName(author);
  const viewer = await getCurrentUser();
  const followers = followerCount(author);
  const following = viewer ? isFollowing(viewer.id, author) : false;

  return (
    <div className="p-inner">
      <Link className="p-back" href="/plaza">
        <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
        返回广场
      </Link>

      <section className={`p-card p-card--pad p-author-hero${media.banner ? ' has-banner' : ''}`}>
        {media.banner && <div className="p-author-banner" style={{ backgroundImage: `url(${media.banner})` }} aria-hidden="true" />}
        <span className={`p-avatar${media.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '80px', ['--h' as string]: 210 }}>{media.avatar ? <img src={media.avatar} alt="" /> : Array.from(author)[0]}</span>
        <div className="p-author-main">
          <h1>{author}</h1>
          <p>@{author} · 创作者{joinedText}</p>
          <div className="p-author-stats">
            <span><strong>{works.length}</strong> 个公开作品</span>
            <span><strong>{followers}</strong> 人关注</span>
            <span><strong>{totalChats >= 10000 ? `${(totalChats / 10000).toFixed(1)} 万` : totalChats}</strong> 人聊过</span>
          </div>
        </div>
        <div className="p-author-actions">
          <AuthorActions author={author} initialBlocked={blocked} initialFollowing={following} initialFollowers={followers} signedIn={Boolean(viewer)} />
        </div>
      </section>

      <div className="p-author-grid">
        <section className="p-card p-card--pad">
          <h2 className="p-form-section-title">关于创作者</h2>
          <p className="p-author-bio">{bio || '这位创作者还没有填写公开简介。'}</p>
        </section>
        <section className="p-card p-card--pad">
          <h2 className="p-form-section-title">创作声明</h2>
          <p className="p-small">公开作品仅展示作者主动公开的设定。角色对话中的私有提示词、未公开世界书和生成配置不会出现在作者主页。</p>
        </section>
      </div>

      <section className="p-section">
        <div className="p-section-head">
          <h2>公开作品</h2>
          <span className="p-section-sub">{works.length} 个</span>
          <Link className="p-section-more" href="/plaza">去广场
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </Link>
        </div>
        {blocked ? (
          <div className="p-empty">
            <div className="p-empty-title">你已屏蔽这位创作者</div>
            <p className="p-empty-text">解除屏蔽后可以重新查看其公开作品。</p>
          </div>
        ) : (
          <div className="p-work-grid">
            {works.map((character) => <ProtoWorkCard key={character.id} character={character} />)}
          </div>
        )}
      </section>
    </div>
  );
}
