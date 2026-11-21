import { displayCardText } from '@/lib/st-macros';
import { tr } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { RpText } from '@/components/rp-text';
import { notFound } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import {
  countChatsForCharacter,
  getCharacterView,
  isAdded,
  isFavorite,
  latestChatForCharacter,
  listComments,
} from '@/lib/characters';
import { listPersonas } from '@/lib/resources-db';
import { balance } from '@/lib/points';
import { STATE_MESSAGE, nsfwAccess } from '@/lib/age-gate';
import { AgeGateButton } from '@/components/age-gate-dialog';
import { getViewMode } from '@/lib/view';
import { startStory } from './actions';
import { ReportButton } from '@/components/report-button';
import { CharacterComments } from '@/components/character-comments';
import { CharacterOwnerActions } from '@/components/character-owner-actions';
import { coverSrc } from '@/components/proto-cover';
import { CharacterCover } from '@/components/character-cover';
import { FavoriteButton } from '@/components/favorite-button';
import { AddToLibraryButton } from '@/components/add-to-library';
import { StartStoryForm } from '@/components/start-story-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const character = getCharacterView(id);
  if (!character) return { title: tr('找不到这个角色') };
  return {
    title: character.name,
    description: character.hook,
    openGraph: {
      title: tr('{0} · 夜话').replace('{0}', character.name),
      description: character.hook,
      images: character.ownerId === null ? [`/characters/${character.id}.jpg`] : [],
    },
  };
}

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = getCharacterView(id);
  if (!character) notFound();

  const user = await getCurrentUser();
  const view = await getViewMode();
  const comments = listComments(character.id);
  const personas = user ? listPersonas(user.id) : [];
  const owned = Boolean(user && character.ownerId === user.id);
  if (!owned && (character.status === 'draft' || character.status === 'pending')) notFound();
  const favorite = user ? isFavorite(user.id, character.id) : false;
  const added = user ? isAdded(user.id, character.id) : false;
  const myChats = user ? countChatsForCharacter(user.id, character.id) : 0;
  const recentChat = user ? latestChatForCharacter(user.id, character.id) : null;
  const access = await nsfwAccess(user?.id ?? null);
  // restricted：不能看（地区/年龄/未登录…）→ 只给名字和说明，不展示封面、开场白和设定，也不能开聊；作者本人不受限
  // gated：能看但自己隐藏了 → 封面打码，其余照常
  const restricted = character.nsfw && !owned && !access.allowed;
  const gated = character.nsfw && !restricted && access.hidden;
  if (restricted) {
    return (
      <main className="page rd-character">
        <div className="p-character-top">
          <Link className="small" href="/plaza">← 返回</Link>
        </div>
        <section className="p-card p-card--pad p-age-wall" style={{ marginTop: 18 }}>
          <span className="p-pill p-pill--sm">18+</span>
          <h1>{character.name}</h1>
          <p className="p-detail-by">@{character.author} · 成人向角色</p>
          <p>{STATE_MESSAGE[access.state]}。</p>
          {(access.state === 'guest' || access.state === 'needs_age' || access.state === 'needs_verification') && (
            <AgeGateButton state={access.state} minAge={access.minAge} className="p-btn p-btn--primary" label={access.state === 'guest' ? '登录并确认年龄' : access.state === 'needs_age' ? '确认年龄' : '去做年龄验证'} />
          )}
        </section>
      </main>
    );
  }
  const lowBalance = Boolean(user && balance(user.id) <= 0);
  const defaultPersona = personas.find((persona) => persona.boundCharacters.includes(character.id)) ?? personas.find((persona) => persona.isDefault);
  const openings = [
    { id: 'default', title: '默认开场', text: character.greeting },
    ...character.alternateGreetings.map((opening, index) => ({ id: `alt-${index}`, title: opening.title, text: opening.text })),
  ];

  return (
    <main className="page rd-character">
      {view !== 'cinema' && !gated && coverSrc(character) && (
        <div className="rd-ambient" aria-hidden="true"><img src={coverSrc(character) ?? ''} alt="" /></div>
      )}
      <div className="p-character-top">
      <Link className="small" href="/plaza">← 返回</Link>

      {gated && (
        <div className="ca-notice" style={{ marginTop: 12 }}>
          <strong>这是一个成人向角色</strong>
          <span>你设置了隐藏 18+，封面已遮住；公开设定仍可阅读，也可以直接开始对话。</span>
          <AgeGateButton state={access.state} minAge={access.minAge} label="显示 18+" />
        </div>
      )}

      {owned && character.status === 'pending' && (
        <div className="p-notice" style={{ marginTop: 12 }}>
          <div className="p-notice-main">
            <div className="p-notice-title">作品正在审核中</div>
            <div>通过后会出现在广场与搜索；你现在仍然可以通过这个链接查看和继续编辑。</div>
          </div>
          <Link className="p-btn p-btn--sm" href={`/create?edit=${character.id}`}>继续编辑</Link>
        </div>
      )}

      {owned && character.status === 'archived' && (
        <div className="p-notice" style={{ marginTop: 12 }}>
          <div className="p-notice-main">
            <div className="p-notice-title">作品已下架</div>
            <div>
              {character.reviewNote ? `理由：${character.reviewNote}${/[。！？!?]$/.test(character.reviewNote) ? '' : '。'}` : '作品当前不会出现在广场与搜索。'}
              修改后可重新提交审核。
            </div>
          </div>
          <Link className="p-btn p-btn--sm" href={`/create?edit=${character.id}`}>继续编辑</Link>
        </div>
      )}

      </div>

      {view === 'cinema' && (
        <section className="cinema-detail-banner">
          <div className="cinema-detail-cover"><CharacterCover character={character} fill /></div>
          <div>
            <p className="eyebrow" style={{ letterSpacing: '.24em' }}>A FILM BY {character.author.toUpperCase()}</p>
            <h1>{character.name}{character.nsfw && <span className="tag" style={{ height: 20, padding: '0 8px', fontSize: 10.5, marginLeft: 8 }}>18+</span>}</h1>
            <p className="cinema-detail-hook">{character.hook}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {character.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
          </div>
        </section>
      )}

      <div className="p-detail" style={{ marginTop: 18 }}>
        <div className="p-detail-sticky">
          <div className="p-detail-id">
            <div className={`p-detail-cover rd-glow p-cover${coverSrc(character) ? ' has-portrait' : ''}`} style={{ ['--h' as string]: character.hue }} data-initial={character.initial} role="img" aria-label={`${character.name}的立绘`}>
              {coverSrc(character) && <img src={coverSrc(character) ?? ''} alt="" />}
              {gated && (
                <div className="p-cover-gate"><strong>18+</strong><span>开启「显示 18+」后查看</span></div>
              )}
            </div>
            <div className="p-detail-title">
              <h1>{character.name}{character.nsfw && <span className="p-pill p-pill--sm" style={{ marginLeft: 8, verticalAlign: 'middle' }}>18+</span>}</h1>
              <p className="p-detail-by"><Link className="p-link" href={`/a/${encodeURIComponent(character.author)}`}>@{character.author}</Link> · 公开角色</p>
              <div className="p-detail-tags">
                {character.tags.map((tag) => <span key={tag} className="p-pill p-pill--sm p-pill--outline">{tag}</span>)}
              </div>
            </div>
          </div>

          <div className="p-card p-card--flat p-detail-stats">
            <div className="p-stat"><div className="p-stat-n">{character.chats}</div><div className="p-stat-l">人聊过</div></div>
            <div className="p-stat"><div className="p-stat-n">{myChats}</div><div className="p-stat-l">我的会话</div></div>
            <div className="p-stat"><div className="p-stat-n">v1</div><div className="p-stat-l">作品版本</div></div>
          </div>

          <div>
            <StartStoryForm lowBalance={lowBalance}
              characterId={character.id}
              personas={personas.map((persona) => ({ id: persona.id, name: persona.name }))}
              defaultPersonaId={defaultPersona?.id}
              openings={openings}
              recentChatId={recentChat}
            />
            <div className="p-detail-minor" style={{ marginTop: 8 }}>
              {user && <FavoriteButton characterId={character.id} initial={favorite} />}
              {user && !owned && !added && <AddToLibraryButton characterId={character.id} initialAdded={added} />}
              <ReportButton targetType="character" targetId={character.id} label="举报" />
            </div>
            {owned && <CharacterOwnerActions characterId={character.id} />}
          </div>
        </div>

        <div className="p-detail-main">
          <section className="p-card p-card--pad">
            <div className="p-eyebrow">故事的开端</div>
            <blockquote className="p-quote rd-quote"><RpText text={character.greeting} /></blockquote>
          </section>

          <section className="p-card">
            <div className="p-card-head"><h2>公开设定</h2><span className="p-small">作者公开内容</span></div>
            <div className="p-sub">
              <div className="p-eyebrow">角色与场景</div>
              <p>{displayCardText(character.description, character.name) || '作者没有填写更多描述。'}</p>
            </div>
            <div className="p-sub">
              <div className="p-eyebrow">互动节奏</div>
              <p>{character.pace}。每轮会保留剧情连续性，你可以决定自己的行动和回应方式。</p>
            </div>
          </section>

          <section className="p-card">
            <div className="p-card-head"><h2>评论 <span className="p-small">{comments.length}</span></h2></div>
            <div style={{ padding: 16 }}>
              <CharacterComments
                characterId={character.id}
                initial={comments}
                currentUserId={user?.id ?? null}
                isAdmin={user ? isAdmin(user) : false}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
