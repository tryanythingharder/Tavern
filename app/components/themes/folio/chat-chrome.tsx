import { displayCardText } from '@/lib/st-macros';
import Link from 'next/link';
import { LiveCover } from '@/components/live-cover';
import type { ChatChromeData } from '@/components/themes/chat-chrome';
import { latinName, pad } from '@/components/themes/folio/lib';
import { FolioBookmarks, FolioComposerTools, FolioFolio, FolioProgress, FolioToc } from '@/components/themes/folio/chat-live';

// 书页 FOLIO 对话页装饰层：左侧「书版」（立绘、目录、题记），右侧「旁注」（记忆、书签、进度），
// 以及中栏底部的书写工具条。消息流与输入框仍由 ChatRoom 渲染，用 CSS 排成手稿。
export function FolioChatChrome({ chrome }: { chrome: ChatChromeData }) {
  const { character } = chrome;
  const latin = latinName({ id: character.id, ownerId: character.cover?.startsWith('/characters/') ? null : 1 });
  // 设定里常有 ST 注释宏 {{// …}}（作者备注 / 加密串），不能原样当题记显示
  const epigraph = displayCardText(character.description, character.name).slice(0, 240);
  const paceParts = character.pace.split(/[·・]/).map((part) => part.trim()).filter(Boolean);
  const issue = pad(new Date().getMonth() + 1);

  return (
    <>
      {/* 窄屏：旁注抽屉（纯 CSS 开关，桌面不显示） */}
      <input type="checkbox" id="fo-notes-toggle" className="fo-notes-cb" aria-label="展开旁注" />
      <label htmlFor="fo-notes-toggle" className="fo-notes-scrim" aria-hidden="true" />
      <aside className="fo-plate" aria-label="角色书版">
        <div className="fo-runhead fo-runhead--l">
          <Link href="/">夜话 No.{issue}</Link><span aria-hidden="true">/</span><Link href="/chats">对话</Link>
        </div>
        <div className="fo-plate-body">
          <Link className="fo-ph" href={`/c/${character.id}`} aria-label={`查看 ${character.name} 的角色卡`}>
            {character.cover ? <LiveCover src={character.cover} /> : <span className="fo-ph-initial" aria-hidden="true">{Array.from(character.name)[0]}</span>}
            <span className="fo-no">Vol. {pad(chrome.chatId)}</span>
          </Link>
          <h1 className="fo-plate-name">{character.name}{latin && <span className="fo-it">{latin}</span>}</h1>
          <div className="fo-by">文 / {character.author}{character.tags.length > 0 && <> · {character.tags.slice(0, 2).join(' · ')}</>}</div>
          {character.hook && <p className="fo-hook">{character.hook}</p>}
          <FolioToc title={chrome.chatTitle} />
          {epigraph && (
            <blockquote className="fo-epi"><span className="fo-it">Epigraph</span>{epigraph}</blockquote>
          )}
          {paceParts.length > 0 && (
            <dl className="fo-style">
              <dt>文风</dt><dd>{paceParts.slice(0, 2).join(' · ')}</dd>
              {paceParts.length > 2 && (<><dt>节奏</dt><dd>{paceParts.slice(2).join(' · ')}</dd></>)}
            </dl>
          )}
        </div>
      </aside>

      <aside className="fo-margin" aria-label="旁注">
        <div className="fo-runhead fo-runhead--r">
          <span className="fo-runhead-mark">☆ 书签 {chrome.bookmarks}</span>
          <FolioFolio initial={chrome.messageCount} />
          <label htmlFor="fo-notes-toggle" className="fo-notes-close">收起 ✕</label>
        </div>
        <div className="fo-margin-body">
          <section>
            <div className="fo-mh"><span>旁注</span><span className="fo-it">Marginalia</span></div>
            <div className="fo-note" style={{ ['--i' as string]: 0 }}>
              <span className="fo-n">1</span>
              <span><span className="fo-k">记忆</span>{chrome.memoryCovered ? `摘要已覆盖前 ${chrome.memoryCovered} 条，旧事不会被忘记。` : '还没记下什么。故事再长一些，会自动写下摘要。'}</span>
            </div>
            <Link className="fo-note" href="/me/personas" style={{ ['--i' as string]: 1 }}>
              <span className="fo-n">2</span>
              <span><span className="fo-k">你的身份</span>{chrome.personaName ? <>以<q>「{chrome.personaName}」</q>的身份进入这段故事。</> : '未设置身份，角色只称你为「你」。'}</span>
            </Link>
            <Link className="fo-note" href="/me/lorebooks" style={{ ['--i' as string]: 2 }}>
              <span className="fo-n">3</span>
              <span><span className="fo-k">世界</span>{chrome.lorebookCount ? `${chrome.lorebookCount} 本世界书，提到关键词时自动带上。` : '没有绑定世界书。'}</span>
            </Link>
          </section>
          <section>
            <div className="fo-mh"><span>书签</span><span className="fo-it">Bookmarks</span></div>
            <FolioBookmarks />
          </section>
          <section className="fo-progress-sec">
            <div className="fo-mh"><span>本章进度</span><span className="fo-it">Progress</span></div>
            <FolioProgress title={chrome.chatTitle} initial={chrome.messageCount} />
            <Link className="fo-add" href="/me/presets">＋ 预设、正则与备份</Link>
          </section>
        </div>
        <div className="fo-foot">
          <FolioFolio initial={chrome.messageCount} big />
          <span>{character.name} · {chrome.chatTitle}<br />{character.author} 著</span>
        </div>
      </aside>

      <FolioComposerTools />
    </>
  );
}
