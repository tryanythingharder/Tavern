import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getChat, getCharacterById, listMessagesPage } from '@/lib/db';
import { toMessageView } from '@/lib/chat-view';
import { ChatRoom } from '@/components/chat-room';
import { ChatSettings } from '@/components/chat-settings';
import { ChatSearch } from '@/components/chat-search';
import { chatSettings, listLorebooks, listQuickReplies, loadGenerationConfig } from '@/lib/resources-db';
import { summaryStatus } from '@/lib/memory';
import { imageConfigured, imageCost, ttsConfigured } from '@/lib/media';

export const metadata: Metadata = { title: '对话' };
export const dynamic = 'force-dynamic';

export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; at?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const { from, at } = await searchParams;
  const branchFrom = Number(from) || null;
  const branchAt = Number(at) || null;
  const chat = getChat(Number(id), user.id);
  if (!chat) notFound();
  const character = getCharacterById(chat.character_id);
  if (!character) notFound();

  const messagePage = listMessagesPage(chat.id, null, 60);
  const messages = messagePage.messages.map(toMessageView);
  const quickReplies = listQuickReplies(user.id).map((reply) => ({ label: reply.label, content: reply.content }));
  const config = loadGenerationConfig(user.id, chat);
  const hasPortrait = character.owner_id === null || Boolean(character.cover_image);
  const bookmarks = messages.filter((message) => message.bookmark).length;
  const settings = chatSettings(chat);
  const lorebookCount = settings.lorebookIds === null ? listLorebooks(user.id).length : settings.lorebookIds.length;
  const memory = summaryStatus(chat, messages.length);
  const branchIndex = branchAt ? messages.findIndex((message) => message.id === branchAt) + 1 : 0;
  const contextRows = [
    { label: '角色', value: character.name, note: '开始故事时冻结的版本，之后修改角色不影响这里', href: `/c/${character.id}` },
    { label: '你的身份', value: config.persona?.name ?? '未设置', note: '只在这段故事里生效', href: '/me/personas' },
    { label: '书签', value: bookmarks ? `${bookmarks} 条` : '还没有书签', note: '在消息操作里标记，随时跳回', href: null },
    { label: '记忆', value: memory.covered ? `摘要覆盖 ${memory.covered} 条` : '还没记下什么', note: '自动抽取式摘要 + 手动记忆', href: null },
    { label: '世界', value: lorebookCount ? `${lorebookCount} 本世界书` : '没有绑定世界书', note: '提到关键词时自动带上', href: '/me/lorebooks' },
  ];
  const cover = character.cover_image || (character.owner_id === null ? `/characters/${character.id}.jpg` : null);

  return (
    <main className="p-inner">
      <div className="p-rp-workbench">
        <div className="p-chat">
          <header className="p-chat-head">
            <div className="p-chat-col p-chat-head-in">
              <Link className="p-chat-icon" href="/chats" aria-label="返回会话列表">
                <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </Link>
              <div className="p-chat-title">
                <span className={`p-avatar${hasPortrait ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '34px', ['--h' as string]: character.hue }}>
                  {cover ? <img src={cover} alt="" /> : character.initial}
                </span>
                <div className="p-chat-title-text">
                  <div className="p-chat-name">{character.name}</div>
                  <div className="p-chat-sub">{chat.title}</div>
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <ChatSearch chatId={chat.id} characterName={character.name} />
                <ChatSettings chatId={chat.id} />
              </div>
            </div>
          </header>
          {branchFrom && branchIndex > 0 && (
            <div className="p-branch-note" role="status">
              <span>已从原故事创建分支 · 第 {branchIndex} 条消息</span>
              <Link href={`/chats/${branchFrom}`}>回到原故事</Link>
            </div>
          )}
          <ChatRoom
            chatId={chat.id}
            characterName={character.name}
            initialMessages={messages}
            initialHasMore={messagePage.hasMore}
            quickReplies={quickReplies}
            media={{ image: imageConfigured(), tts: ttsConfigured(), imageCost: imageCost() }}
            title={chat.title}
            personaName={config.persona?.name}
          />
        </div>

        <aside className="p-rp-context" aria-label="故事设定">
          <div className="p-rp-context-head"><span>STORY</span><h2>故事设定</h2></div>
          <div className="p-rp-context-group">
            {contextRows.map((row) => (
              <section className="p-rp-context-section" key={row.label}>
                <div className="p-rp-context-action" style={{ cursor: 'default' }}>
                  <span className="p-rp-context-main">
                    <span className="p-rp-context-label">{row.label}</span>
                    <span className="p-rp-context-value">{row.value}</span>
                    <span className="p-rp-context-note">{row.note}</span>
                  </span>
                </div>
              </section>
            ))}
          </div>
          <div className="p-rp-context-group">
            <section className="p-rp-context-section">
              <a className="p-rp-context-action" href="/me/presets">
                <span className="p-rp-context-main">
                  <span className="p-rp-context-label">高级设置</span>
                  <span className="p-rp-context-value">预设、世界书、正则、记忆与备份</span>
                </span>
                <span className="p-rp-context-go">
                  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </span>
              </a>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
