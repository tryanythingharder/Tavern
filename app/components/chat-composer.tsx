'use client';

import type React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { RpText } from '@/components/rp-text';
import { ModelPicker, NewbieTip } from '@/components/model-picker';
import { PersonaSwitch, type PersonaCurrent, type PersonaOption } from '@/components/persona-switch';
import { langLabel as langName } from '@/lib/translation';
import type { HelperActions } from '@/lib/helper-events';
import type { QrItem, QrSet, QrState } from '@/lib/quick-replies';
import type { RegexMacros } from '@/lib/regex-apply';
import type { ChatRoomMedia } from '@/components/chat-room';

// 对话页底部输入区（从 chat-room.tsx 拆出）：回到最新、提示/错误条、快捷回复栏、助手脚本、输入框与发送/停止、继续/代写/预览/生图/身份/模型。
// 首屏用不到的部分按需加载：卡内助手脚本运行器（只在有脚本时显示，纯客户端）、快捷回复栏（有快捷回复集才渲染）
const HelperRunner = dynamic(() => import('@/components/helper-runner').then((m) => m.HelperRunner), { ssr: false });
const QuickReplyBar = dynamic(() => import('@/components/quick-reply-bar').then((m) => m.QuickReplyBar));

function friendlyError(message: string): string {
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '网络连接失败，请检查网络后重试。';
  if (/点数不足|402/.test(message)) return '点数不足，先签到领点或兑换/充值后再试。';
  if (/429|频繁|限流/.test(message)) return '请求太频繁，稍等一会儿再试。';
  if (/模型未配置/.test(message)) return '模型未配置，请联系管理员。';
  return message;
}

export type ChatComposerProps = {
  chatId: number;
  characterName: string;
  personaName: string;
  macros: RegexMacros | undefined;
  media: ChatRoomMedia | undefined;
  personaInit: { current: PersonaCurrent; options: PersonaOption[]; lockedId: number | null } | undefined;
  persona: PersonaCurrent;
  personaLock: number | null;
  onPersonaChange: (next: { locked: number | null; persona: PersonaCurrent }) => void;
  notice: string;
  slashHelp: { cmd: string; desc: string }[] | null;
  setSlashHelp: (value: { cmd: string; desc: string }[] | null) => void;
  error: string;
  failed: boolean;
  onRetry: () => void;
  qr: QrState;
  setQr: (value: QrState) => void;
  streaming: boolean;
  runQuickReply: (set: QrSet, item: QrItem) => Promise<void>;
  helperActions: HelperActions;
  preview: boolean;
  togglePreview: () => void;
  draft: string;
  setDraft: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  send: (override?: string) => Promise<void>;
  onStop: () => void;
  messageCount: number;
  continueLast: () => Promise<void>;
  impersonate: () => Promise<void>;
  impersonating: boolean;
  translatingInput: boolean;
  modelLang: string;
  imageBusy: boolean;
  setImageOpen: (value: boolean) => void;
  billing: { cost: number; balance: number; free?: number } | null;
  awayFromBottom: boolean;
  unseen: number;
  jumpToLatest: () => void;
};

export function ChatComposer({ chatId, characterName, personaName, macros, media, personaInit, persona, personaLock, onPersonaChange, notice, slashHelp, setSlashHelp, error, failed, onRetry, qr, setQr, streaming, runQuickReply, helperActions, preview, togglePreview, draft, setDraft, inputRef, send, onStop, messageCount, continueLast, impersonate, impersonating, translatingInput, modelLang, imageBusy, setImageOpen, billing, awayFromBottom, unseen, jumpToLatest }: ChatComposerProps) {
  return (
    <div className="p-chat-compose">
      <div className="p-chat-col">
        <button
          type="button"
          className={`rd-jump${awayFromBottom ? ' is-visible' : ''}`}
          onClick={jumpToLatest}
          aria-label={unseen ? `回到最新，${unseen} 条新消息` : '回到最新'}
          tabIndex={awayFromBottom ? 0 : -1}
        >
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          <span>{unseen ? `${unseen} 条新消息` : '回到最新'}</span>
        </button>
        {notice && <div className="p-chat-notice" role="status">{notice}</div>}
        {slashHelp && (
          <div className="p-slash-help" role="dialog" aria-label="斜杠命令">
            <div className="p-slash-help-head"><strong>斜杠命令</strong><span className="p-small">和 SillyTavern 写法一致，可以用 | 串联</span><button type="button" className="p-btn p-btn--sm" onClick={() => setSlashHelp(null)}>关闭</button></div>
            <dl>{slashHelp.map((item) => <div key={item.cmd}><dt><code>{item.cmd}</code></dt><dd>{item.desc}</dd></div>)}</dl>
          </div>
        )}
        {error && (
          <div role="alert" className="p-form-error" style={{ margin: '0 0 8px' }}>
            <div>{friendlyError(error)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {failed && (
                <button className="p-btn p-btn--sm" type="button" onClick={onRetry}>重试</button>
              )}
              {/点数不足|402/.test(error) && (
                <>
                  <Link className="p-btn p-btn--sm p-btn--primary" href="/me/points">签到领点</Link>
                  <Link className="p-btn p-btn--sm" href="/me/points">兑换码 / 充值</Link>
                </>
              )}
            </div>
          </div>
        )}
        {qr.sets.length > 0 && <QuickReplyBar state={qr} scope={{ chatId }} onState={setQr} disabled={streaming} onRun={(set, item) => void runQuickReply(set, item)} />}
        <HelperRunner chatId={chatId} names={{ char: characterName, user: personaName || macros?.user || '' }} actions={helperActions} />
        <NewbieTip />
        {preview && draft.trim() && !streaming && (
          <div className="p-chat-preview" aria-live="polite">
            <span className="p-chat-preview-k">预览</span>
            <div className="p-msg-copy"><RpText text={draft} /></div>
          </div>
        )}
        <div className="p-chat-compose-row">
          <textarea
            ref={inputRef}
            className="p-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="写下台词，或用 *行动描述* 推进故事…（/ 开头是命令，/help 查看）"
            aria-label="消息"
          />
          {streaming ? (
            <button className="p-chat-send is-stop" type="button" onClick={onStop} aria-label="停止生成"><span className="rd-stop" aria-hidden="true" /></button>
          ) : (
            <button className="p-chat-send" type="button" onClick={() => void send()} disabled={!draft.trim() && !messageCount} aria-label={draft.trim() ? '发送' : '让角色接着回复'} title={draft.trim() ? undefined : '空着发送：让角色接着回复'}>
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
            </button>
          )}
        </div>
        <div className="p-chat-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '6px 0 0' }}>
          <span className="p-chat-acts">
            <button className="p-chat-continue p-chat-act" type="button" disabled={streaming || impersonating || messageCount === 0} onClick={() => void continueLast()} title="不写台词，让角色接着上一条往下写">▸ 继续</button>
            <button className="p-chat-act p-chat-imp" type="button" disabled={streaming || impersonating} onClick={() => void impersonate()} title="让 AI 以你的身份写一句（输入框里的字会当作方向提示），写完可以再改">{impersonating ? '代写中…' : '✎ 代写'}</button>
            {translatingInput && <span className="p-chat-tr-busy" role="status">正在把输入翻译成{langName(modelLang)}…</span>}
            <button className="p-chat-act p-chat-pv" type="button" aria-pressed={preview} onClick={togglePreview} title="在输入框上方按 RP 排版预览：*动作*、「对白」、((场外))">{preview ? '◉' : '◎'} 预览</button>
            {media?.image && (
              <button className="p-chat-act p-chat-img" type="button" disabled={streaming || imageBusy} onClick={() => setImageOpen(true)} title="按当前剧情生成一张插图，作为消息插入对话">✦ 生图</button>
            )}
            {personaInit && (
              <PersonaSwitch
                endpoint={`/api/chats/${chatId}/persona`}
                personas={personaInit.options}
                lockedId={personaLock}
                current={persona}
                onChange={onPersonaChange}
              />
            )}
            <ModelPicker chatId={chatId} />
          </span>
          <span className="p-small p-chat-hint">Enter 发送 · Shift + Enter 换行 · 回复由模型生成，可能出错</span>
          {billing && <span className="p-small">本回合 -{billing.cost} 点{billing.free ? `（免费额度抵扣 ${billing.free}）` : ''} · 余额 {billing.balance}</span>}
        </div>
      </div>
    </div>
  );
}
