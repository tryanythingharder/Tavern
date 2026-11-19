import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { chatBranches, getChat, getCharacterById, listMessagesPage } from '@/lib/db';
import { ChatBranches } from '@/components/chat-branches';
import { toMessageView } from '@/lib/chat-view';
import { ChatRoom } from '@/components/chat-room';
import { ChatSettings } from '@/components/chat-settings';
import { ChatSearch } from '@/components/chat-search';
import { AppearanceButton } from '@/components/appearance-drawer';
import { chatSettings, listLorebooks, listQuickReplies, loadGenerationConfig } from '@/lib/resources-db';
import { summaryStatus } from '@/lib/memory';
import { imageConfigured, imageCost, ttsConfigured } from '@/lib/media';
import { getTheme } from '@/lib/theme';
import { ThemeChatChrome } from '@/components/themes/chat-chrome';
import { ChatNavSheet } from '@/components/chat-nav-sheet';
import { ChatFocusToggle, ChatFocusChrome } from '@/components/chat-focus';
import { ChatStage } from '@/components/chat-stage';
import { chatFocusBootScript } from '@/lib/chat-focus';
import { characterLoreEntries, loadExtras, parseCardLore } from '@/lib/card-extras';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '对话' });
}
export const dynamic = 'force-dynamic';

export default async function ChatPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; at?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  const { from } = await searchParams;
  const branchFrom = Number(from) || null;
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
  // 卡内世界书也算一本（有启用条目时），不然带世界书的卡会显示「没有绑定世界书」
  const cardLoreOn = characterLoreEntries(character.id, parseCardLore(chat.card_lore)).some((entry) => entry.enabled);
  const lorebookCount = (settings.lorebookIds === null ? listLorebooks(user.id).length : settings.lorebookIds.length) + (cardLoreOn ? 1 : 0);
  const memory = summaryStatus(chat, messages.length);
  const branches = chatBranches(chat.id, user.id);
  const contextRows = [
    { label: '角色', value: character.name, note: '开始故事时冻结的版本，之后修改角色不影响这里', href: `/c/${character.id}` },
    { label: '你的身份', value: config.persona?.name ?? '未设置', note: '只在这段故事里生效', href: '/me/personas' },
    { label: '书签', value: bookmarks ? `${bookmarks} 条` : '还没有书签', note: '在消息操作里标记，随时跳回', href: null },
    { label: '记忆', value: memory.covered ? `摘要覆盖 ${memory.covered} 条` : '还没记下什么', note: '自动抽取式摘要 + 手动记忆', href: null },
    { label: '世界', value: lorebookCount ? `${lorebookCount} 本世界书` : '没有绑定世界书', note: '提到关键词时自动带上', href: '/me/lorebooks' },
  ];
  const theme = await getTheme();
  // 卡里带 HTML 美化（立绘、状态栏等）时，沉浸模式默认打开
  const richCard = loadExtras(character.id).flags?.html === true;
  const cover = character.cover_image || (character.owner_id === null ? `/characters/${character.id}.jpg` : null);

  return (
    <main className="p-inner">
      <script dangerouslySetInnerHTML={{ __html: chatFocusBootScript(richCard, Boolean(cover)) }} />
      {cover && <div className="chat-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(cover)})` }} />}
      {cover && <ChatStage cover={cover} name={character.name} />}
      <ChatFocusChrome />
      <div className="p-rp-workbench" data-theme-chat={theme}>
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
                <ChatFocusToggle richCard={richCard} />
                <ChatNavSheet />
                <ChatSearch chatId={chat.id} characterName={character.name} />
                <ChatSettings chatId={chat.id} />
                <AppearanceButton className="btn btn--sm ua-trigger--chat" />
              </div>
            </div>
          </header>
          <ChatBranches info={branches} justCreated={Boolean(branchFrom && branchFrom === branches.parent?.id)} />
          <ChatRoom
            chatId={chat.id}
            characterName={character.name}
            initialMessages={messages}
            initialHasMore={messagePage.hasMore}
            quickReplies={quickReplies}
            media={{ image: imageConfigured(), tts: ttsConfigured(), imageCost: imageCost() }}
            title={chat.title}
            personaName={config.persona?.name}
            characterCover={cover}
            characterHue={character.hue}
            displayRules={config.regexRules.filter((rule) => rule.enabled && rule.scope !== 'send')}
            macros={{ char: character.name, user: config.persona?.name || user.nickname }}
          />
        </div>

        {/* 主题侧栏放在对话之后：键盘 Tab 先到顶栏、消息和输入框，再到角色书版 / 进度栏（视觉位置由 grid 决定） */}
        <ThemeChatChrome
          theme={theme}
          chrome={{
            chatId: chat.id,
            chatTitle: chat.title,
            character: {
              id: character.id,
              name: character.name,
              author: character.author,
              hue: character.hue,
              cover,
              tags: safeTags(character.tags),
              hook: character.hook,
              description: character.description,
              pace: character.pace,
            },
            messageCount: messages.length,
            bookmarks,
            memoryCovered: memory.covered,
            personaName: config.persona?.name ?? null,
            lorebookCount,
          }}
        />
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

function safeTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    }
  }
  return [];
}
