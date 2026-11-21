'use client';

import Link from 'next/link';
import { LiveCover } from '@/components/live-cover';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { ChatChromeData } from '@/components/themes/chat-chrome';
import { actNumeral, giantSize, shortPace } from '@/components/themes/stage/util';

// 一幕多少回合：章节导轨由消息数推出来
const ACT = 10;

// 对话页的戏台装饰：左侧角色卡、右侧章节导轨、输入坞的快捷动作。
// 消息流与输入框仍由 ChatRoom 渲染，这里只读 DOM（计数、滚动）并通过受控 textarea 的原生 setter 写入草稿。
export function StageChatChrome({ chrome }: { chrome: ChatChromeData }) {
  const { character } = chrome;
  const [count, setCount] = useState(chrome.messageCount);
  const [dock, setDock] = useState<HTMLElement | null>(null);
  const [head, setHead] = useState<HTMLElement | null>(null);
  const cardRef = useRef<HTMLElement>(null);

  // 计数跟随实时消息；移动端头卡随滚动收缩（--p: 0 → 1）
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('.p-chat-scroll');
    setDock(document.querySelector<HTMLElement>('.p-chat-compose > .p-chat-col'));
    setHead(document.querySelector<HTMLElement>('.p-chat-title-text'));
    if (!scroller) return;
    // 长动作描写在行内会折成两块，标记后由 CSS 改成独立的舞台提示块
    const markActs = () => {
      scroller.querySelectorAll<HTMLElement>('.p-msg-copy .rp-act').forEach((el) => {
        const long = (el.textContent ?? '').trim().length > 14;
        if (el.classList.contains('stg-act-long') !== long) el.classList.toggle('stg-act-long', long);
      });
    };
    const recount = () => { setCount(scroller.querySelectorAll('article.p-msg').length); markActs(); };
    recount();
    const observer = new MutationObserver(recount);
    observer.observe(scroller, { childList: true, subtree: true });

    const mq = window.matchMedia('(max-width: 1023px)');
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const host = cardRef.current?.parentElement;
        if (!host) return;
        if (!mq.matches) { host.style.removeProperty('--p'); host.classList.remove('is-mini'); return; }
        const p = Math.min(1, Math.max(0, scroller.scrollTop / 220));
        host.style.setProperty('--p', p.toFixed(3));
        host.classList.toggle('is-mini', p > 0.6);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    mq.addEventListener('change', onScroll);
    onScroll();

    // 桌面端左卡的轻微 3D 倾斜
    const card = cardRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const move = (event: PointerEvent) => {
      if (!card || mq.matches) return;
      const r = card.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width;
      const y = (event.clientY - r.top) / r.height;
      card.classList.add('is-tilting');
      card.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
      card.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
    };
    const leave = () => {
      if (!card) return;
      card.classList.remove('is-tilting');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    };
    if (card && !reduce && fine) {
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', onScroll);
      card?.removeEventListener('pointermove', move);
      card?.removeEventListener('pointerleave', leave);
    };
  }, []);

  const current = Math.floor(Math.max(count - 1, 0) / ACT);
  const inAct = count === 0 ? 0 : ((count - 1) % ACT) + 1;
  const total = Math.max(5, current + 2);
  const first = Math.max(0, Math.min(current - 3, total - 6));
  const steps = Array.from({ length: Math.min(6, total) }, (_, i) => first + i);

  const jumpToAct = useCallback((act: number) => {
    const scroller = document.querySelector<HTMLElement>('.p-chat-scroll');
    if (!scroller) return;
    const messages = scroller.querySelectorAll<HTMLElement>('article.p-msg');
    const target = act === 0 ? scroller.querySelector<HTMLElement>('.p-rp-prologue') : messages[Math.min(act * ACT, messages.length - 1)];
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, []);

  const insert = useCallback((before: string, after = '', options: { send?: boolean } = {}) => {
    const input = document.querySelector<HTMLTextAreaElement>('.p-chat-input');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const value = options.send ? before : input.value.slice(0, start) + before + input.value.slice(start, end) + after + input.value.slice(end);
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    const caret = options.send ? value.length : start + before.length + (end - start);
    requestAnimationFrame(() => {
      input.setSelectionRange(caret, caret);
      if (options.send) {
        const send = document.querySelector<HTMLButtonElement>('.p-chat-send:not(.is-stop)');
        if (send && !send.disabled) send.click();
      }
    });
  }, []);

  const nameSize = giantSize(character.name, 76, 260);
  const tags = character.tags.slice(0, 3);
  const pace = shortPace(character.pace);

  return (
    <>
      <aside className="stg-char" ref={cardRef} aria-label={`${character.name} 的角色卡`} style={{ ['--name' as string]: `${nameSize}px` } as CSSProperties}>
        <div className="stg-char-ph">
          <LiveCover src={character.cover || null} draggable={false} fallback={<span className="stg-art stg-art--none" aria-hidden="true"><b>{Array.from(character.name)[0]}</b></span>} />
          <div className="stg-char-top">
            <Link className="stg-back" href="/">← 卡册</Link>
            <span>{tags[0] ?? 'ON STAGE'}{chrome.lorebookCount > 0 && <> · 世界书 {chrome.lorebookCount}</>}</span>
          </div>
          <div className="stg-char-nm">
            <span className="stg-ital">by {character.author} —</span>
            <h1>{character.name}</h1>
            <p>{character.hook}</p>
          </div>
          <div className="stg-m-rel" aria-hidden="true">
            <span>第{actNumeral(current) === '序' ? '一' : actNumeral(current)}幕</span>
            <div className="stg-m-bar">{Array.from({ length: ACT }, (_, i) => <i key={i} className={i < inAct ? 'is-f' : ''} />)}</div>
            <span>{count} 回合</span>
          </div>
          <div className="stg-m-mini" aria-hidden="true"><span>{count} 回合</span><span className="is-a">{current === 0 ? '序幕' : `第${actNumeral(current)}幕`}</span></div>
        </div>

        <div className="stg-char-body">
          <div>
            <div className="stg-sec-h"><span>本幕进度 · <b>{current === 0 ? '序幕' : `第${actNumeral(current)}幕`}</b></span><span className="stg-v">{inAct}<small> / {ACT}</small></span></div>
            <div className="stg-meter" aria-hidden="true">
              {Array.from({ length: ACT }, (_, i) => (
                <i key={i} className={i < inAct - 1 ? 'is-f' : i === inAct - 1 ? 'is-a' : i === inAct ? 'is-n' : ''} style={{ animationDelay: `${0.2 + i * 0.04}s` }} />
              ))}
            </div>
            <div className="stg-meter-cap"><span>开场</span><span><em>{count}</em> 回合 · {chrome.chatTitle}</span><span>下一幕</span></div>
          </div>

          <div>
            <div className="stg-sec-h"><span>本场</span><span className="stg-ital">this act, live</span></div>
            <div className="stg-moods3">
              <div className="stg-mood"><span>回合</span><b>{count}</b><Dots n={Math.min(5, Math.ceil(inAct / 2))} /></div>
              <div className={`stg-mood${chrome.bookmarks ? ' is-hot' : ''}`}><span>书签</span><b>{chrome.bookmarks}</b><Dots n={Math.min(5, chrome.bookmarks)} /></div>
              <div className="stg-mood"><span>记忆</span><b>{chrome.memoryCovered}</b><Dots n={Math.min(5, Math.ceil(chrome.memoryCovered / 4))} /></div>
            </div>
          </div>

          <div>
            <div className="stg-sec-h"><span>{character.name}的戏路</span><span>{pace}</span></div>
            <div className="stg-mem">
              <span className="is-new" style={{ ['--rot' as string]: '-1deg' }}>以「{chrome.personaName ?? '你'}」入戏</span>
              {tags.map((tag, i) => <span key={tag} style={{ ['--rot' as string]: i % 2 ? '1.2deg' : '-1.4deg' }}>#{tag}</span>)}
              <span className="is-more" style={{ ['--rot' as string]: '-2deg' }}>{chrome.lorebookCount ? `世界书 ×${chrome.lorebookCount}` : '无世界书'}</span>
            </div>
          </div>

          <div className="stg-cfoot">
            <Link href={`/c/${character.id}`}>档案</Link>
            <Link href="/me/lorebooks">世界书</Link>
            <Link href="/me/presets">高级</Link>
            <span className="stg-ital">by {character.author}</span>
          </div>
        </div>
      </aside>

      <nav className="stg-rail" aria-label="章节">
        <span className="stg-rail-t"><b>章节</b> · ACTS</span>
        <div className="stg-steps">
          {steps.map((act) => {
            const state = act < current ? 'is-done' : act === current ? 'is-now' : act === current + 1 ? 'is-next' : 'is-lock';
            const label = act === 0 ? '序幕' : `第${actNumeral(act)}幕`;
            return (
              <button
                key={act}
                type="button"
                className={`stg-step ${state}`}
                title={act === current ? `${label} · ${chrome.chatTitle}` : label}
                aria-label={act === current ? `${label}（当前）` : label}
                aria-current={act === current ? 'step' : undefined}
                disabled={act > current}
                onClick={() => jumpToAct(act)}
                data-label={act === current ? chrome.chatTitle : undefined}
              >
                {actNumeral(act)}
              </button>
            );
          })}
        </div>
        <div className="stg-pct" title={`本幕第 ${inAct} 回合，每幕 ${ACT} 回合`}>{inAct}/{ACT}<small>本幕</small></div>
      </nav>

      {head && createPortal(<span className="stg-head-act"><b>{current === 0 ? '序幕' : `第${actNumeral(current)}幕`}</b><span className="stg-ital">{current === 0 ? 'prologue' : `act ${current}`}</span></span>, head)}

      {dock && createPortal(
        <div className="stg-qa" role="toolbar" aria-label="快捷动作">
          <span className="stg-grab" aria-hidden="true" />
          <button type="button" className="stg-q stg-q--prim" onClick={() => insert('*继续*', '', { send: true })}>▸ 继续</button>
          <button type="button" className="stg-q" onClick={() => insert('*', '*')}><span className="stg-q-act">✦</span> 动作</button>
          <button type="button" className="stg-q" onClick={() => insert('「', '」')}>「对白」</button>
          <button type="button" className="stg-q stg-q--ooc" onClick={() => insert('((', '))')}>( OOC )</button>
          <button type="button" className="stg-q" onClick={() => insert('((请推进剧情，引入一个新的转折))')}>⚑ 推进剧情</button>
          <span className="stg-qa-sp" />
          <span className="stg-persona">以 <i>{Array.from(chrome.personaName ?? '你')[0]}</i> <b>{chrome.personaName ?? '你自己'}</b> 的身份</span>
        </div>,
        dock,
      )}
    </>
  );
}

function Dots({ n }: { n: number }) {
  return <div className="stg-dots" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < n ? 'is-on' : ''} />)}</div>;
}
