'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { activeQrSets, type QrItem, type QrSet, type QrState } from '@/lib/quick-replies';

// 对话输入框上方的快捷回复栏（ST Quick Reply v2）：全局集 + 本聊天集，一集一段；
// 右键 / 长按按钮弹出子菜单（contextList）；末尾「⚙」开关哪些集在全局 / 本聊天生效。弹出层沿用站内下拉框的主题样式。

type Scope = { chatId: number } | { roomId: number };

function Popover({ anchor, onClose, children, label }: { anchor: DOMRect; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ left: anchor.left, top: anchor.top, visibility: 'hidden' });
  const [up, setUp] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const height = el.offsetHeight;
    const width = el.offsetWidth;
    const below = window.innerHeight - anchor.bottom;
    const goUp = anchor.top > height + 12 || anchor.top > below;
    setUp(goUp);
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const top = goUp ? Math.max(8, anchor.top - height - 6) : anchor.bottom + 6;
    setStyle({ left, top, maxHeight: goUp ? anchor.top - 14 : below - 14 });
  }, [anchor]);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = (event: Event) => {
      if (ref.current && event.target instanceof Node && ref.current.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('scroll', onScroll, true);
    ref.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className={`ui-select-pop qr-pop${up ? ' is-up' : ''}`} role="menu" aria-label={label} style={style}>
      {children}
    </div>,
    document.body,
  );
}

/** 子菜单要列出的按钮：引用的集；勾了「连带」再展开那个集里按钮自己的子菜单（防环，最多 3 层） */
function contextItems(item: QrItem, sets: QrSet[], depth = 0, seen = new Set<number>()): { set: QrSet; item: QrItem; depth: number }[] {
  if (depth > 2) return [];
  const out: { set: QrSet; item: QrItem; depth: number }[] = [];
  for (const link of item.context) {
    const set = sets.find((entry) => entry.id === link.setId);
    if (!set || seen.has(set.id)) continue;
    seen.add(set.id);
    for (const sub of set.replies) {
      if (sub.hidden) continue;
      out.push({ set, item: sub, depth });
      if (link.chain) out.push(...contextItems(sub, sets, depth + 1, seen));
    }
  }
  return out;
}

export function QuickReplyBar({ state, scope, onRun, onState, disabled }: {
  state: QrState;
  scope: Scope;
  onRun: (set: QrSet, item: QrItem) => void;
  onState: (next: QrState) => void;
  disabled?: boolean;
}) {
  const [menu, setMenu] = useState<{ anchor: DOMRect; set: QrSet; item: QrItem } | null>(null);
  const [settings, setSettings] = useState<DOMRect | null>(null);
  const [error, setError] = useState('');
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const active = activeQrSets(state);
  const groups = active.map((set) => ({ set, items: set.replies.filter((item) => !item.hidden) })).filter((group) => group.items.length);

  const closeMenu = useCallback(() => setMenu(null), []);
  const closeSettings = useCallback(() => setSettings(null), []);

  const toggle = async (setId: number, where: 'global' | 'scope', on: boolean) => {
    setError('');
    const next = (ids: number[]) => (on ? [...ids, setId] : ids.filter((id) => id !== setId));
    const ids = next(where === 'global' ? state.globalIds : state.scopeIds);
    const body = where === 'global' ? { ...scope, globalIds: ids } : { ...scope, scopeIds: ids };
    const before = state;
    onState(where === 'global' ? { ...state, globalIds: ids } : { ...state, scopeIds: ids });
    try {
      const response = await fetch('/api/quick-replies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as QrState & { message?: string };
      if (!response.ok) throw new Error(data.message || '保存失败');
      onState({ sets: data.sets, globalIds: data.globalIds, scopeIds: data.scopeIds });
    } catch (caught) {
      onState(before);
      setError((caught as Error).message);
    }
  };

  if (!state.sets.length) return null;

  const openMenu = (target: HTMLElement, set: QrSet, item: QrItem) => {
    if (!contextItems(item, state.sets).length) return false;
    setMenu({ anchor: target.getBoundingClientRect(), set, item });
    return true;
  };

  return (
    <div className="p-chat-quick qr-bar" role="toolbar" aria-label="快捷回复">
      {groups.map(({ set, items }) => (
        <div className="qr-group" key={set.id} data-set={set.name}>
          {items.map((item) => {
            const hasMenu = item.context.length > 0;
            const style = set.color ? ({ '--qr-color': set.color } as CSSProperties) : undefined;
            return (
              <button
                key={item.id}
                className={`p-chip qr-btn${set.color ? (set.onlyBorderColor ? ' qr-btn--border' : ' qr-btn--fill') : ''}${hasMenu ? ' qr-btn--menu' : ''}`}
                type="button"
                style={style}
                disabled={disabled}
                title={item.title || item.message}
                aria-haspopup={hasMenu ? 'menu' : undefined}
                onClick={() => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    return;
                  }
                  onRun(set, item);
                }}
                onContextMenu={(event) => {
                  if (openMenu(event.currentTarget, set, item)) event.preventDefault();
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch' || !hasMenu) return;
                  const target = event.currentTarget;
                  longPressed.current = false;
                  pressTimer.current = setTimeout(() => {
                    longPressed.current = openMenu(target, set, item);
                  }, 480);
                }}
                onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
                onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
              >
                {item.label}
                {hasMenu && <span className="qr-caret" aria-hidden="true">⋯</span>}
              </button>
            );
          })}
        </div>
      ))}
      <button
        className="p-chip qr-gear"
        type="button"
        aria-label="快捷回复设置"
        title="快捷回复设置"
        aria-haspopup="menu"
        aria-expanded={!!settings}
        onClick={(event) => setSettings(settings ? null : event.currentTarget.getBoundingClientRect())}
      >
        {groups.length ? '⚙' : '快捷回复 ⚙'}
      </button>

      {menu && (
        <Popover anchor={menu.anchor} onClose={closeMenu} label={`${menu.item.label} 子菜单`}>
          {contextItems(menu.item, state.sets).map(({ set, item, depth }) => (
            <button
              key={`${set.id}-${item.id}-${depth}`}
              className="ui-select-opt qr-opt"
              type="button"
              role="menuitem"
              style={depth ? { paddingLeft: 10 + depth * 14 } : undefined}
              title={item.title || item.message}
              onClick={() => {
                setMenu(null);
                onRun(set, item);
              }}
            >
              <span>{item.label}</span>
              <span className="qr-opt-set">{set.name}</span>
            </button>
          ))}
        </Popover>
      )}

      {settings && (
        <Popover anchor={settings} onClose={closeSettings} label="快捷回复设置">
          <div className="ui-select-group">快捷回复集 · 全局 / 本聊天</div>
          {state.sets.map((set) => (
            <div className="qr-set-row" key={set.id}>
              <span className="qr-set-name" title={set.name}>{set.name}</span>
              <label className="qr-set-check" title="所有聊天都显示">
                <input type="checkbox" checked={state.globalIds.includes(set.id)} onChange={(event) => void toggle(set.id, 'global', event.target.checked)} />
                <span>全局</span>
              </label>
              <label className="qr-set-check" title="只在这个聊天显示">
                <input type="checkbox" checked={state.scopeIds.includes(set.id)} onChange={(event) => void toggle(set.id, 'scope', event.target.checked)} />
                <span>本聊天</span>
              </label>
            </div>
          ))}
          {error && <p className="qr-error" role="status">{error}</p>}
          <a className="ui-select-opt qr-manage" href="/me/quick-replies">管理快捷回复…</a>
        </Popover>
      )}
    </div>
  );
}
