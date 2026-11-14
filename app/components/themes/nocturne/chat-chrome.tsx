import Link from 'next/link';
import type { ChatChromeData } from '@/components/themes/chat-chrome';
import { NocTimecode } from '@/components/themes/nocturne/parts';
import { actInfo, cnNumber, pad2, runtime, TURNS_PER_ACT } from '@/components/themes/nocturne/lib';

// 夜幕对话页的装饰层：模糊场景底板 + 遮幅黑边 + 幕次导轨 + 「他记得」卡 + 手机顶部进度条。
// 消息与输入框仍由 ChatRoom 渲染，由 styles/themes/nocturne.css 改排成字幕。
export function NocturneChatChrome({ chrome }: { chrome: ChatChromeData }) {
  const { character } = chrome;
  const info = actInfo(chrome.messageCount);
  const acts = Array.from({ length: info.act + 1 }, (_, index) => index + 1).slice(-4);
  const remembers = [
    chrome.memoryCovered ? `前 ${chrome.memoryCovered} 条对话已写进记忆摘要。` : '还没写进记忆，故事刚刚开始。',
    chrome.personaName ? `你在这段故事里是「${chrome.personaName}」。` : '你还没有设定身份，以「你」入场。',
    chrome.bookmarks ? `你收藏了 ${chrome.bookmarks} 句台词。` : '还没有收藏的台词。',
    chrome.lorebookCount ? `${chrome.lorebookCount} 本世界书在幕后待命。` : '没有绑定世界书。',
  ];
  const memoryRatio = chrome.messageCount ? Math.min(1, chrome.memoryCovered / chrome.messageCount) : 0;

  return (
    <div className="noc-chat-chrome">
      <div className="noc-plate" style={character.cover ? { backgroundImage: `url(${character.cover})` } : undefined} aria-hidden="true" />
      <div className="noc-shade" aria-hidden="true" />
      <div className="noc-grain" aria-hidden="true" />
      <div className="noc-vignette" aria-hidden="true" />
      <div className="noc-bar noc-bar--top" aria-hidden="true">
        <span><i className="noc-rec" />正在放映 · {character.name}</span>
        <span>{character.tags.slice(0, 3).join(' · ') || chrome.chatTitle}</span>
      </div>
      <div className="noc-bar noc-bar--bot" aria-hidden="true">
        <span>作者 {character.author}{character.pace ? ` · ${character.pace}` : ''}</span>
        <span>剧本由你与角色共同写成</span>
      </div>

      <div className="noc-slate" aria-hidden="true">
        <span className="noc-caps">Scene<b className="noc-latin">{pad2(info.act)}</b></span>
        <span className="noc-caps">Take<b className="noc-latin">{pad2(info.turn)}</b></span>
        <NocTimecode start={chrome.messageCount * 24 * 110 + 8} />
      </div>

      {/* 幕次导轨（桌面） */}
      <aside className="noc-acts" aria-label="故事进度">
        <span className="noc-acts-spine" aria-hidden="true" />
        <span className="noc-acts-fill" style={{ height: `${Math.round(((acts.indexOf(info.act) + info.progress) / acts.length) * 100)}%` }} aria-hidden="true" />
        <div className="noc-mk is-done">
          <span className="noc-latin">00</span>
          <h4>序幕</h4>
          <small>开场白 · {chrome.chatTitle}</small>
        </div>
        {acts.map((act) => {
          const state = act < info.act ? 'is-done' : act === info.act ? 'is-now' : 'is-next';
          return (
            <div className={`noc-mk ${state}`} key={act}>
              <span className="noc-latin">{pad2(act)}</span>
              <h4>第{cnNumber(act)}幕</h4>
              <small>
                {state === 'is-done' && `${TURNS_PER_ACT} 回合`}
                {state === 'is-now' && `正在进行 · 第 ${info.turn} 回合`}
                {state === 'is-next' && '尚未开拍'}
              </small>
            </div>
          );
        })}
        <div className="noc-runtime">
          <span className="noc-caps">片长</span>
          <b className="noc-latin">{runtime(chrome.messageCount)}</b>
        </div>
      </aside>

      {/* 「他记得」卡 */}
      <aside className="noc-dossier" aria-label={`${character.name}记得的事`}>
        <Link className="noc-dossier-ph" href={`/c/${character.id}`} style={character.cover ? { backgroundImage: `url(${character.cover})` } : undefined}>
          {!character.cover && <span className="noc-dossier-initial">{Array.from(character.name)[0]}</span>}
          <span className="noc-latin">Cast · {character.name}</span>
        </Link>
        <h5>{character.name} 记得</h5>
        <ul>
          {remembers.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <div className="noc-meter"><span>记忆覆盖</span><b>{Math.round(memoryRatio * 100)}%</b></div>
        <div className="noc-meter-bar"><i style={{ width: `${Math.max(4, Math.round(memoryRatio * 100))}%` }} /></div>
        <div className="noc-dossier-links">
          <Link href="/me/personas">身份</Link>
          <Link href="/me/lorebooks">世界书</Link>
          <Link href="/me/presets">高级设置 →</Link>
        </div>
      </aside>

      {/* 手机：导轨折叠成顶部进度条 */}
      <div className="noc-strip" aria-hidden="true">
        {acts.map((act) => (
          <i key={act} className={act < info.act ? 'is-done' : act === info.act ? 'is-now' : undefined} style={act === info.act ? { ['--p' as string]: `${Math.round(info.progress * 100)}%` } : undefined} />
        ))}
        <span><b>{pad2(info.act)}</b> 第{cnNumber(info.act)}幕 · 第 {info.turn} 回合</span>
      </div>
    </div>
  );
}
