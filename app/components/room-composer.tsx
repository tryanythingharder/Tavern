'use client';

import dynamic from 'next/dynamic';
import { ModelPicker } from '@/components/model-picker';
import { PersonaSwitch, type PersonaCurrent, type PersonaOption } from '@/components/persona-switch';
import { Select } from '@/components/ui-select';
import type { QrItem, QrSet, QrState } from '@/lib/quick-replies';
import type { RoomMedia, RoomMember } from '@/components/room-message-row';

// 群聊底部输入区（从 room-chat.tsx 拆出）：错误条、快捷回复栏、调度说明与「让 TA 发言」、手动调度选人、输入框与发送/停止、继续/代写/生图/身份/模型。
// 快捷回复栏只在有快捷回复集时渲染，按需加载
const QuickReplyBar = dynamic(() => import('@/components/quick-reply-bar').then((m) => m.QuickReplyBar));

const STRATEGY_HINT: Record<string, string> = {
  natural: '自然：你叫到谁的名字，谁就先答；否则轮流。',
  roundRobin: '轮流：发言次数最少的角色先答。',
  manual: '手动：你自己选本轮由谁回应。',
  pooled: '随机：每轮从成员里抽一个。',
};

export type RoomComposerProps = {
  roomId: number;
  strategy: string;
  members: RoomMember[];
  error: string;
  qr: QrState;
  setQr: (value: QrState) => void;
  runQuickReply: (set: QrSet, item: QrItem) => Promise<void>;
  streaming: boolean;
  typing: string | null;
  impersonating: boolean;
  forceTalk: (memberId: string) => void;
  speakerId: string;
  setSpeakerId: (value: string) => void;
  draft: string;
  setDraft: (value: string) => void;
  send: () => void;
  onStop: () => void;
  messageCount: number;
  continueLast: () => void;
  impersonate: () => Promise<void>;
  media: RoomMedia | undefined;
  imageBusy: boolean;
  setImageOpen: (value: boolean) => void;
  personaInit: { current: PersonaCurrent; options: PersonaOption[]; lockedId: number | null } | undefined;
  personaLock: number | null;
  persona: PersonaCurrent;
  onPersonaChange: (next: { locked: number | null; persona: PersonaCurrent }) => void;
};

export function RoomComposer({ roomId, strategy, members, error, qr, setQr, runQuickReply, streaming, typing, impersonating, forceTalk, speakerId, setSpeakerId, draft, setDraft, send, onStop, messageCount, continueLast, impersonate, media, imageBusy, setImageOpen, personaInit, personaLock, persona, onPersonaChange }: RoomComposerProps) {
  return (
    <div className="p-chat-compose">
      <div className="p-chat-col">
        {error && <p role="alert" className="p-form-error" style={{ margin: '0 0 8px' }}>{error}</p>}
        {qr.sets.length > 0 && <QuickReplyBar state={qr} scope={{ roomId }} onState={setQr} disabled={streaming} onRun={(set, item) => void runQuickReply(set, item)} />}
        <div className="p-rp-compose-context">
          <span className="p-compose-persona">{STRATEGY_HINT[strategy] ?? ''}</span>
          {typing && <span className="p-small">{typing} 正在输入…</span>}
          <span className="room-talk" role="group" aria-label="让成员发言">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                className="room-talk-btn"
                data-muted={member.muted ? '' : undefined}
                title={`让${member.name}发言${member.muted ? '（已静音，仍可点名）' : ''}`}
                aria-label={`让${member.name}发言`}
                disabled={streaming || impersonating}
                onClick={() => forceTalk(member.id)}
              >
                <span className={`p-avatar${member.avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: '24px', ['--h' as string]: member.hue }}>{member.avatar ? <img src={member.avatar} alt="" loading="lazy" /> : member.initial}</span>
              </button>
            ))}
          </span>
          {strategy === 'manual' && (
            <label className="p-small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              本轮由
              <Select className="p-select" style={{ width: 'auto', padding: '4px 8px' }} value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}>
                {members.filter((member) => !member.muted).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </Select>
              回应
            </label>
          )}
        </div>
        <div className="p-chat-compose-row">
          <textarea
            className="p-chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="说点什么，或者叫某个角色的名字…"
            aria-label="消息"
          />
          {streaming ? (
            <button className="p-chat-send" type="button" onClick={onStop} aria-label="停止生成">■</button>
          ) : (
            <button className="p-chat-send" type="button" onClick={() => send()} disabled={!draft.trim() || impersonating} aria-label="发送">↑</button>
          )}
        </div>
        <div className="p-compose-meta">
          <span className="p-chat-acts">
            <button className="p-chat-continue p-chat-act" type="button" disabled={streaming || impersonating || messageCount === 0} onClick={continueLast} title="不写台词，让角色接着上一条往下写；最后一条是你的话时，让下一位角色接话">▸ 继续</button>
            <button className="p-chat-act p-chat-imp" type="button" disabled={streaming || impersonating} onClick={() => void impersonate()} title="让 AI 以你的身份写一句（输入框里的字会当作方向提示），写完可以再改">{impersonating ? '代写中…' : '✎ 代写'}</button>
            {media?.image && (
              <button className="p-chat-act p-chat-img" type="button" disabled={streaming || imageBusy} onClick={() => setImageOpen(true)} title="按当前剧情生成一张插图，作为消息插入群聊">{imageBusy ? '✦ 生图中…' : '✦ 生图'}</button>
            )}
            {personaInit && (
              <PersonaSwitch
                endpoint={`/api/rooms/${roomId}/persona`}
                personas={personaInit.options}
                lockedId={personaLock}
                current={persona}
                scopeLabel="本群聊"
                onChange={onPersonaChange}
              />
            )}
            <ModelPicker roomId={roomId} />
          </span>
          <span className="p-small p-chat-hint">Enter 发送 · Shift + Enter 换行 · 群聊回复由模型生成</span>
        </div>
      </div>
    </div>
  );
}
