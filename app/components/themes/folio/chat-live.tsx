'use client';

import { useCallback, useEffect, useState } from 'react';

// 书页对话页的「活」部分：从 ChatRoom 渲染出的消息 DOM 读取页数、书签与章节，
// 不改动共享组件。消息增删、书签切换时通过 MutationObserver 自动更新。

type Mark = { id: string; page: number; text: string };
type DomState = { count: number; ids: string[]; marks: Mark[] };

const PER_CHAPTER = 12;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
const pad = (n: number) => String(n).padStart(2, '0');

function read(): DomState {
  const articles = Array.from(document.querySelectorAll<HTMLElement>('.p-chat-scroll article.p-msg'));
  const marks: Mark[] = [];
  articles.forEach((article, i) => {
    if (article.querySelector('button[aria-label="书签"][aria-pressed="true"]')) {
      const text = (article.querySelector('.p-msg-copy')?.textContent ?? '').replace(/\s+/g, ' ').trim();
      marks.push({ id: article.id, page: i + 1, text: text.slice(0, 40) || '（图片）' });
    }
  });
  return { count: articles.length, ids: articles.map((a) => a.id), marks };
}

function same(a: DomState, b: DomState) {
  return a.count === b.count && a.ids.join() === b.ids.join() && a.marks.map((m) => m.id + m.text).join() === b.marks.map((m) => m.id + m.text).join();
}

function useChatDom(initialCount = 0): DomState {
  const [state, setState] = useState<DomState>({ count: initialCount, ids: [], marks: [] });
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        setState((prev) => (same(prev, next) ? prev : next));
      });
    };
    update();
    const target = document.querySelector('.p-chat') ?? document.body;
    const mo = new MutationObserver(update);
    mo.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
    };
  }, []);
  return state;
}

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** 页码：p. 12（或右栏底部的大号页码） */
export function FolioFolio({ initial, big = false }: { initial: number; big?: boolean }) {
  const { count } = useChatDom(initial);
  const n = count || initial;
  return big ? <span className="fo-big fo-it">{n}</span> : <span className="fo-folio-no fo-it">p. {pad(n)}</span>;
}

/** 本卷目录：序 + 每 12 条一章 + 待续 */
export function FolioToc({ title }: { title: string }) {
  const { count, ids } = useChatDom();
  const chapters = Math.max(1, Math.ceil(count / PER_CHAPTER));
  const current = chapters - 1;
  const goTop = useCallback(() => {
    const el = document.querySelector('.p-rp-prologue');
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, []);
  const shown = Array.from({ length: chapters }, (_, i) => i).slice(-4);
  return (
    <nav className="fo-toc" aria-label="本卷目录">
      <h4><span>本卷目录</span><span className="fo-it">Contents</span></h4>
      <button type="button" onClick={goTop}><span className="fo-r">·</span><span className="fo-t">序 · {title}</span><span className="fo-d" /><span className="fo-p">序</span></button>
      {shown.map((i) => {
        const firstId = ids[i * PER_CHAPTER];
        return (
          <button key={i} type="button" className={i === current ? 'is-on' : undefined} aria-current={i === current ? 'true' : undefined} onClick={() => firstId && scrollToId(firstId)}>
            <span className="fo-r">{ROMAN[i] ?? i + 1}</span>
            <span className="fo-t">第{CN[i] ?? i + 1}章</span>
            <span className="fo-d" />
            <span className="fo-p">{pad(i * PER_CHAPTER + 1)}</span>
          </button>
        );
      })}
      <span className="fo-toc-todo"><span className="fo-r">{ROMAN[chapters] ?? chapters + 1}</span><span className="fo-t">未写完的一章</span><span className="fo-d" /><span className="fo-p">待续</span></span>
    </nav>
  );
}

/** 书签：消息上点亮的书签 */
export function FolioBookmarks() {
  const { marks } = useChatDom();
  if (!marks.length) return <p className="fo-empty">还没有书签。在消息操作里点 ☆，就会夹在这里。</p>;
  return (
    <div className="fo-bmks">
      {marks.slice(-5).map((mark, i) => (
        <button key={mark.id} type="button" className="fo-bmk" style={{ ['--i' as string]: i + 3 }} onClick={() => scrollToId(mark.id)}>
          <span className="fo-p fo-it">p.{pad(mark.page)}</span>
          <span className="fo-bmk-t">{mark.text}</span>
        </button>
      ))}
    </div>
  );
}

/** 本章进度 */
export function FolioProgress({ title, initial }: { title: string; initial: number }) {
  const { count } = useChatDom(initial);
  const n = count || initial;
  const chapter = Math.max(1, Math.ceil(n / PER_CHAPTER));
  const inChapter = n - (chapter - 1) * PER_CHAPTER;
  const pct = Math.round((inChapter / PER_CHAPTER) * 100);
  return (
    <div className="fo-mprog">
      <div className="fo-prog-row"><span>第{CN[chapter - 1] ?? chapter}章 · {title}</span><b>p.{pad(n)} / 约 {chapter * PER_CHAPTER}</b></div>
      <div className="fo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="本章进度"><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

// ─── 书写工具条：给输入框插入 RP 标记，或对最新一条执行重写/书签 ───

function setDraft(transform: (value: string, start: number, end: number) => { value: string; caret: number }) {
  const input = document.querySelector<HTMLTextAreaElement>('.p-chat-input');
  if (!input) return;
  const { value, caret } = transform(input.value, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length);
  // 受控 textarea：用原生 setter + input 事件让 React 同步状态
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  requestAnimationFrame(() => input.setSelectionRange(caret, caret));
}

function wrap(open: string, close: string) {
  setDraft((value, start, end) => {
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + open + selected + close + value.slice(end);
    return { value: next, caret: selected ? start + open.length + selected.length + close.length : start + open.length };
  });
}

function latestAssistant(): HTMLElement | null {
  const list = document.querySelectorAll<HTMLElement>('.p-chat-scroll article.p-msg:not(.p-msg-user)');
  return list.length ? list[list.length - 1] : null;
}

// 首段下沉只给以文字开头的段落：开头是「『“（* 或整段动作描写时不放大。
function applyDropCap() {
  const first = document.querySelector<HTMLElement>('.p-chat-scroll .p-rp-prologue ~ article.p-msg:not(.p-msg-user) .p-msg-copy > .rp-p:first-child');
  document.querySelectorAll('.p-chat-scroll .rp-p.fo-dc').forEach((el) => { if (el !== first) el.classList.remove('fo-dc'); });
  if (!first) return;
  const firstArticle = document.querySelector('.p-chat-scroll .p-rp-prologue ~ article.p-msg');
  const ok = Boolean(firstArticle && firstArticle.contains(first))
    && /^[\p{L}\p{N}]/u.test((first.textContent ?? '').trimStart())
    && !first.matches(':has(> .rp-act:only-child)');
  first.classList.toggle('fo-dc', ok);
}

export function FolioComposerTools() {
  const [canRegen, setCanRegen] = useState(false);
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    const update = () => {
      applyDropCap();
      const latest = latestAssistant();
      const regen = latest?.querySelector<HTMLButtonElement>('button[aria-label="重新生成"]');
      setCanRegen(Boolean(regen && !regen.disabled && latest?.classList.contains('is-latest')));
      setMarked(latest?.querySelector('button[aria-label="书签"]')?.getAttribute('aria-pressed') === 'true');
    };
    update();
    const target = document.querySelector('.p-chat') ?? document.body;
    const mo = new MutationObserver(update);
    mo.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed', 'class'] });
    return () => mo.disconnect();
  }, []);

  const regen = () => latestAssistant()?.querySelector<HTMLButtonElement>('button[aria-label="重新生成"]')?.click();
  const mark = () => latestAssistant()?.querySelector<HTMLButtonElement>('button[aria-label="书签"]')?.click();

  return (
    <div className="fo-ctool" role="toolbar" aria-label="书写工具">
      <button type="button" onClick={() => wrap('「', '」')} title="插入对白"><span className="fo-k">「…」</span>对白</button>
      <button type="button" onClick={() => wrap('*', '*')} title="插入动作描写"><span className="fo-k">*</span> 动作</button>
      <button type="button" onClick={() => wrap('((', '))')} title="插入场外说明"><span className="fo-k">((</span> 场外</button>
      <span className="fo-sep" aria-hidden="true" />
      <button type="button" onClick={regen} disabled={!canRegen} title="重写最新一段">⟲ 重写</button>
      <button type="button" onClick={mark} aria-pressed={marked} title="给最新一段夹书签">{marked ? '★' : '☆'} 书签</button>
      <span className="fo-rt">Enter 落笔 · Shift+Enter 另起一行</span>
      <label htmlFor="fo-notes-toggle" className="fo-notes-btn" title="展开旁注：记忆、书签与进度"><span className="fo-k">†</span> 旁注</label>
    </div>
  );
}
