'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lockPageScroll } from '@/lib/scroll-lock';
import { usePlayMode } from '@/components/play-mode';

type ModelOption = { id: string; source: string; isDefault: boolean; price?: number; priceLabel?: string; priceShort?: string; name?: string; summary?: string };


// 模型名 → 给新手看的友好说明（只是猜测性标签，模型 id 原样保留）
function friendly(id: string): string {
  const name = id.toLowerCase();
  if (/gemini/.test(name)) return '上下文长，记得住更多剧情';
  if (/claude|opus|sonnet/.test(name)) return '文笔细腻，擅长长篇剧情';
  if (/haiku|-mini|flash|lite|turbo|small/.test(name)) return '响应快、省点数';
  if (/gpt-4|gpt-5|o1|o3|o4/.test(name)) return '理解力强，稳定全能';
  if (/deepseek|r1|reason|think/.test(name)) return '会先思考，逻辑和推理强';
  if (/qwen|glm|kimi|moonshot|doubao|yi-/.test(name)) return '中文语感自然';
  return '';
}

// 对话里的模型选择：列出后台启用渠道的全部模型，按会话保存。
// 弹层挂到 body 上（不被输入区的 overflow 裁掉），桌面按上下可用空间决定往哪边弹、限高内部滚动；
// 窄屏（≤720px）改成底部弹层并锁住背后页面滚动。模型多于 8 个时给搜索，有多个提供方时按提供方分组。
// 键盘：↑/↓/Home/End/PageUp/PageDown 移动，Enter 选中，Esc 关闭并把焦点还给按钮。
const MOBILE_QUERY = '(max-width: 720px)';
const SEARCH_AT = 8;
type Row = { id: string; label: string; full: string; note: string; tag: boolean; price: string; group: string };
type Place = { mobile: boolean; style: CSSProperties; up: boolean; cover: boolean };
// 桌面面板：最高 460；列表至少想留约 240；标题 + 搜索框 + 底部链接 + 内边距约 150
const WANT_H = 460;
const LIST_MIN = 240;
const CHROME_H = 150;

export function ModelPicker({ chatId, roomId }: { chatId?: number; roomId?: number }) {
  const endpoint = roomId ? `/api/rooms/${roomId}/model` : `/api/chats/${chatId}/settings`;
  const mode = usePlayMode();
  const [models, setModels] = useState<ModelOption[]>([]);
  const [current, setCurrent] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [place, setPlace] = useState<Place | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const listId = `mp-list-${uid}`;
  const optId = (index: number) => `mp-opt-${uid}-${index}`;

  useEffect(() => {
    let alive = true;
    fetch(endpoint, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { model?: string; models?: ModelOption[] } | null) => {
        if (!alive || !data) return;
        setModels(data.models ?? []);
        setCurrent(data.model ?? '');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [endpoint]);

  const fallback = models.find((item) => item.isDefault)?.id ?? models[0]?.id ?? '';
  const active = current && models.some((item) => item.id === current) ? current : '';
  const shown = active || fallback;
  const shownItem = models.find((item) => item.id === shown);
  const needle = query.trim().toLowerCase();
  const sources = useMemo(() => [...new Set(models.map((item) => item.source || ''))], [models]);
  const grouped = models.length > SEARCH_AT && sources.length > 1;

  // 展示用的行：「跟随默认」在最前（搜索时隐藏），分组时按提供方首次出现的顺序排；键盘的上下顺序就是这个顺序
  const rows = useMemo<Row[]>(() => {
    const hit = needle ? models.filter((item) => `${item.id} ${item.name ?? ''} ${item.source ?? ''} ${item.summary ?? ''}`.toLowerCase().includes(needle)) : models;
    const ordered = grouped ? sources.flatMap((source) => hit.filter((item) => (item.source || '') === source)) : hit;
    const out: Row[] = needle ? [] : [{
      id: '', label: '跟随默认', full: '跟随默认', tag: false, price: '', group: '',
      note: mode !== 'newbie' ? `当前为 ${fallback}，按后台优先级自动切换线路` : '站点推荐的模型，线路不通时自动换',
    }];
    for (const item of ordered) {
      const label = item.name || item.id;
      out.push({
        id: item.id, label, tag: item.isDefault, price: item.priceLabel ?? '', group: grouped ? item.source || '' : '',
        full: [label, item.name && item.name !== item.id ? item.id : '', item.priceLabel ?? ''].filter(Boolean).join(' · '),
        note: item.summary || (mode !== 'newbie' ? (grouped ? '' : item.source) : friendly(item.id)),
      });
    }
    return out;
  }, [models, needle, grouped, sources, mode, fallback]);

  const selectedIndex = Math.max(0, rows.findIndex((row) => row.id === active));

  const close = useCallback((focusTrigger: boolean) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // 位置：桌面优先贴输入区上沿（不挡输入框）；那里放不下「列表约 240px + 头尾」时，
  // 改为盖住输入区、底边贴按钮上沿（按钮仍可见）；再不行往下弹；都不够就以视口为界居中，高度取 min(460, 视口高 - 32)。
  // 任何情况下面板都在视口内，搜索框与分组头留在面板里，只有列表内部滚动。窄屏是底部弹层，避开软键盘。
  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const vv = window.visualViewport;
    const viewH = window.innerHeight;
    const viewW = document.documentElement.clientWidth || window.innerWidth;
    if (window.matchMedia(MOBILE_QUERY).matches) {
      const visibleBottom = vv ? vv.offsetTop + vv.height : viewH;
      const visibleH = vv ? vv.height : viewH;
      setPlace({ mobile: true, up: true, cover: false, style: { bottom: Math.max(0, viewH - visibleBottom), maxHeight: Math.max(0, Math.min(visibleH - 16, Math.max(240, Math.round(visibleH * 0.85)))) } });
      return;
    }
    const margin = 8;
    const edge = 16; // 盖住输入区 / 居中时离视口边的距离
    const gap = 8;
    const t = trigger.getBoundingClientRect();
    const compose = trigger.closest('.p-chat-compose')?.getBoundingClientRect();
    const width = Math.min(380, viewW - margin * 2);
    const left = Math.min(Math.max(margin, t.left), viewW - width - margin);
    // 想要的高度：列表至少约 240px，加上标题、搜索框、底部链接；视口实在太矮时以「视口高 - 32」为限
    const need = Math.min(WANT_H, LIST_MIN + CHROME_H, viewH - edge * 2);
    const aboveCompose = compose && compose.top < t.top ? compose.top - gap - margin : -1;
    const aboveTrigger = t.top - gap - edge;
    const below = viewH - t.bottom - gap - edge;
    let next: Place;
    if (aboveCompose >= need) {
      next = { mobile: false, up: true, cover: false, style: { left, width, maxHeight: Math.min(WANT_H, aboveCompose), bottom: viewH - compose!.top + gap } };
    } else if (aboveTrigger >= need) {
      next = { mobile: false, up: true, cover: true, style: { left, width, maxHeight: Math.min(WANT_H, aboveTrigger), bottom: viewH - t.top + gap } };
    } else if (below >= need) {
      next = { mobile: false, up: false, cover: true, style: { left, width, maxHeight: Math.min(WANT_H, below), top: t.bottom + gap } };
    } else {
      const h = Math.max(0, Math.min(WANT_H, viewH - edge * 2));
      next = { mobile: false, up: true, cover: true, style: { left, width, maxHeight: h, top: Math.max(edge, Math.round((viewH - h) / 2)) } };
    }
    setPlace(next);
  }, []);

  // 打开：量位置、高亮当前项、聚焦（桌面聚焦搜索框；窄屏聚焦列表，不主动弹软键盘）
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    measure();
    setActiveIndex(selectedIndex);
    // 只在打开那一刻做，之后列表变化不重置
  }, [open]);

  useEffect(() => {
    if (!open || !place) return;
    const list = listRef.current;
    const on = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && on) {
      const lr = list.getBoundingClientRect();
      const or = on.getBoundingClientRect();
      list.scrollTop += or.top - lr.top - (list.clientHeight - or.height) / 2;
    }
    if (!place.mobile && searchRef.current) searchRef.current.focus({ preventScroll: true });
    else listRef.current?.focus({ preventScroll: true });
  }, [open, place?.mobile, place !== null]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || popRef.current?.contains(target)) return;
      close(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(true); } };
    const onResize = () => measure();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, [open, close, measure]);

  // 底部弹层打开时锁住背后页面
  useEffect(() => {
    if (!open || !place?.mobile) return;
    return lockPageScroll();
  }, [open, place?.mobile]);

  // 高亮项始终在列表可视区内
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const el = typeof document !== 'undefined' ? document.getElementById(optId(activeIndex)) : null;
    if (!list || !el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.top < lr.top) list.scrollTop -= lr.top - er.top + 4;
    else if (er.bottom > lr.bottom) list.scrollTop += er.bottom - lr.bottom + 4;
  }, [activeIndex, open]);

  if (!models.length) return null;

  const pick = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }) });
      if (response.ok) setCurrent(id);
    } finally {
      setSaving(false);
      close(true);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const last = rows.length - 1;
    const inInput = event.target === searchRef.current;
    const move = (next: number) => { event.preventDefault(); setActiveIndex(Math.max(0, Math.min(last, next))); };
    switch (event.key) {
      case 'ArrowDown': return move(activeIndex >= last ? 0 : activeIndex + 1);
      case 'ArrowUp': return move(activeIndex <= 0 ? last : activeIndex - 1);
      case 'PageDown': return move(activeIndex + 8);
      case 'PageUp': return move(activeIndex - 8);
      case 'Home': if (!inInput) move(0); return;
      case 'End': if (!inInput) move(last); return;
      case 'Enter': {
        event.preventDefault();
        const row = rows[activeIndex];
        if (row) void pick(row.id);
        return;
      }
      case 'Escape': event.preventDefault(); event.stopPropagation(); close(true); return;
      case 'Tab': close(false); return;
      default:
    }
  };

  const scopeLabel = roomId ? '本房间' : '本对话';
  const showSearch = models.length > SEARCH_AT;
  const activeId = rows[activeIndex] ? optId(activeIndex) : undefined;
  const headingId = `mp-head-${uid}`;

  const renderRow = (row: Row, index: number) => {
    const selected = row.id === active;
    return (
      <div
        key={row.id || '__default'}
        id={optId(index)}
        role="option"
        aria-selected={selected}
        aria-disabled={saving || undefined}
        title={row.full}
        className={`mp-opt${selected ? ' is-on' : ''}${index === activeIndex ? ' is-active' : ''}`}
        onPointerMove={(event) => { if (event.pointerType === 'mouse' && (event.movementX || event.movementY) && index !== activeIndex) setActiveIndex(index); }}
        onClick={() => void pick(row.id)}
      >
        <span className="mp-opt-row">
          <span className="mp-opt-name">{row.label}</span>
          {row.tag ? <em className="mp-tag">推荐</em> : null}
          {row.price ? <em className="mp-price">{row.price}</em> : null}
          {selected ? <span className="mp-check" aria-hidden="true">✓</span> : null}
        </span>
        {row.note ? <span className="mp-opt-note">{row.note}</span> : null}
      </div>
    );
  };

  // 分组：连续同组的行包进 role=group
  const body: ReactNode[] = [];
  for (let i = 0; i < rows.length; ) {
    const group = rows[i].group;
    if (!group) { body.push(renderRow(rows[i], i)); i += 1; continue; }
    const start = i;
    while (i < rows.length && rows[i].group === group) i += 1;
    const gid = `mp-g-${uid}-${start}`;
    body.push(
      <div key={`g-${group}`} role="group" aria-labelledby={gid} className="mp-group">
        <div id={gid} className="mp-group-label" role="presentation" title={group}>{group}</div>
        {rows.slice(start, i).map((row, k) => renderRow(row, start + k))}
      </div>,
    );
  }

  const pop = open && place && typeof document !== 'undefined' ? createPortal(
    <>
      {place.mobile ? <div className="mp-scrim" aria-hidden="true" onClick={() => close(true)} /> : null}
      <div
        ref={popRef}
        className={`mp-pop mp-pop--model${place.mobile ? ' is-sheet' : place.up ? ' is-up' : ' is-down'}${place.cover ? ' is-cover' : ''}`}
        style={place.style}
        role="dialog"
        aria-modal={place.mobile ? true : undefined}
        aria-labelledby={headingId}
        onKeyDown={onKeyDown}
      >
        {place.mobile ? <div className="mp-grip" aria-hidden="true" /> : null}
        <div className="mp-head">
          <strong id={headingId}>选择模型</strong>
          <span>{mode === 'newbie' ? '不同模型文风和价格不同，可以随时换着试' : `${models.length} 个可用 · 仅对${scopeLabel}生效 · 按模型计价`}</span>
          {place.mobile ? <button type="button" className="mp-x" aria-label="关闭" onClick={() => close(true)}>✕</button> : null}
        </div>
        {showSearch && (
          <input
            ref={searchRef}
            className="mp-search"
            type="search"
            role="combobox"
            aria-expanded={true}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            aria-label="搜索模型"
            placeholder="搜索模型"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); if (listRef.current) listRef.current.scrollTop = 0; }}
          />
        )}
        <div
          ref={listRef}
          id={listId}
          className="mp-list"
          role="listbox"
          aria-label="选择模型"
          aria-activedescendant={activeId}
          aria-busy={saving || undefined}
          tabIndex={showSearch ? -1 : 0}
        >
          {body}
          {!rows.length && <p className="mp-empty" role="status">没有匹配的模型</p>}
        </div>
        <a className="mp-more" href="/models">模型广场：看介绍、设默认 →</a>
      </div>
    </>,
    document.body,
  ) : null;

  return (
    <div className="mp mp--model" ref={boxRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`选择模型，当前：${shownItem?.name || shown}`}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => { if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setOpen(true); } }}
        title={shownItem?.name && shownItem.name !== shown ? `${shownItem.name} · ${shown}` : shown}
      >
        <span className="mp-dot" aria-hidden="true" />
        <span className="mp-name">{shown}</span>
        {shownItem?.priceShort ? <span className="mp-trigger-price">{shownItem.priceShort}</span> : null}
        <span aria-hidden="true">▾</span>
      </button>
      {pop}
    </div>
  );
}

// 新手引导：第一次进对话时的写法提示，可关
export function NewbieTip() {
  const mode = usePlayMode();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try { setHidden(localStorage.getItem('tavern-newbie-tip') === '1'); } catch { setHidden(false); }
  }, []);
  if (mode !== 'newbie' || hidden) return null;
  return (
    <div className="pm-tip" role="note">
      <span><b>小提示</b> 直接写台词就行；<code>*动作*</code> 用星号包住；<code>((场外话))</code> 用双括号。不知道接什么？点「▸ 继续」让角色接着演，或「✎ 代写」让 AI 帮你写一句。</span>
      <button type="button" aria-label="不再提示" onClick={() => { setHidden(true); try { localStorage.setItem('tavern-newbie-tip', '1'); } catch { /* 无痕模式 */ } }}>×</button>
    </div>
  );
}
