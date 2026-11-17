'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 手机端「目录」：对话页顶栏按钮 → 底部抽屉，列出章节（每 12 条一章）与书签，点一下跳过去。
// 和书页主题的桌面目录同一套规则，只读 ChatRoom 渲染出的消息 DOM，不改共享组件。桌面端隐藏。

const PER_CHAPTER = 12;
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

type Item = { id: string; n: number; text: string };
type State = { ids: string[]; heads: string[]; marks: Item[] };

function excerpt(article: Element) {
  return (article.querySelector('.p-msg-copy')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 36) || '（图片）';
}

function read(): State {
  const articles = Array.from(document.querySelectorAll<HTMLElement>('.p-chat-scroll article.p-msg'));
  const marks: Item[] = [];
  const heads: string[] = [];
  articles.forEach((article, i) => {
    if (i % PER_CHAPTER === 0) heads.push(excerpt(article));
    if (article.querySelector('button[data-act="bookmark"][aria-pressed="true"]')) marks.push({ id: article.id, n: i + 1, text: excerpt(article) });
  });
  return { ids: articles.map((a) => a.id), heads, marks };
}

function go(target: Element | null) {
  if (!target) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function ChatNavSheet() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ ids: [], heads: [], marks: [] });
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setState(read());
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const jump = (target: Element | null) => {
    setOpen(false);
    requestAnimationFrame(() => go(target));
  };
  const chapters = state.heads.length;

  return (
    <>
      <button type="button" className="btn btn--sm cns-fab" aria-label="目录" title="目录" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h9" /></svg>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="cns" role="dialog" aria-modal="true" aria-label="章节与书签">
          <button type="button" className="cns-scrim" aria-label="关闭" tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="cns-sheet">
            <div className="cns-grip" aria-hidden="true" />
            <div className="cns-head">
              <b>目录</b>
              <span>{state.ids.length} 条 · {Math.max(1, chapters)} 章</span>
              <button ref={closeRef} type="button" className="cns-x" onClick={() => setOpen(false)} aria-label="关闭目录">✕</button>
            </div>
            <div className="cns-jumps">
              <button type="button" onClick={() => jump(document.querySelector('.p-rp-prologue') ?? document.querySelector('.p-chat-scroll article.p-msg'))}>↑ 回到开头</button>
              <button type="button" onClick={() => jump(Array.from(document.querySelectorAll('.p-chat-scroll article.p-msg')).pop() ?? null)}>↓ 最新一条</button>
            </div>
            <h3>章节</h3>
            {chapters === 0 ? <p className="cns-empty">故事还没开始。</p> : (
              <ol className="cns-list">
                {state.heads.map((head, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => jump(document.getElementById(state.ids[i * PER_CHAPTER]))} aria-current={i === chapters - 1 ? 'true' : undefined}>
                      <span className="cns-n">第{CN[i] ?? i + 1}章</span>
                      <span className="cns-t">{head}</span>
                      <span className="cns-p">{i * PER_CHAPTER + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <h3>书签</h3>
            {state.marks.length === 0 ? <p className="cns-empty">还没有书签。在消息操作里点 ☆，就会夹在这里。</p> : (
              <ol className="cns-list">
                {state.marks.map((mark) => (
                  <li key={mark.id}>
                    <button type="button" onClick={() => jump(document.getElementById(mark.id))}>
                      <span className="cns-n">★</span>
                      <span className="cns-t">{mark.text}</span>
                      <span className="cns-p">{mark.n}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      , document.body)}
    </>
  );
}
