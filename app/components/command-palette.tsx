'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ⌘K / Ctrl+K 快速跳转：页面、最近的故事、直接搜索
type Item = { id: string; label: string; hint?: string; href: string; group: string; keywords?: string };

const PAGES: Item[] = [
  { id: 'home', label: '发现', hint: '推荐与场景', href: '/', group: '页面', keywords: 'home discover faxian' },
  { id: 'plaza', label: '广场', hint: '社区作品', href: '/plaza', group: '页面', keywords: 'plaza guangchang' },
  { id: 'models', label: '模型广场', hint: '选模型、看价格', href: '/models', group: '页面', keywords: 'model moxing guangchang' },
  { id: 'chats', label: '对话', hint: '全部故事', href: '/chats', group: '页面', keywords: 'chat duihua' },
  { id: 'rooms', label: '多角色房间', hint: '群像场景', href: '/rooms', group: '页面', keywords: 'room fangjian' },
  { id: 'create', label: '创作角色', hint: '新建角色卡', href: '/create', group: '页面', keywords: 'create chuangzuo' },
  { id: 'library', label: '我的角色库', href: '/library', group: '页面', keywords: 'library' },
  { id: 'import', label: '导入角色卡', hint: 'JSON / PNG', href: '/me/import', group: '设定', keywords: 'import daoru' },
  { id: 'presets', label: '预设', href: '/me/presets', group: '设定', keywords: 'preset yushe' },
  { id: 'lorebooks', label: '世界书', href: '/me/lorebooks', group: '设定', keywords: 'lorebook world shijieshu' },
  { id: 'personas', label: '我的身份', href: '/me/personas', group: '设定', keywords: 'persona shenfen' },
  { id: 'regex', label: '正则', href: '/me/regex', group: '设定', keywords: 'regex zhengze' },
  { id: 'quick', label: '快捷回复', href: '/me/quick-replies', group: '设定', keywords: 'quick reply' },
  { id: 'appearance', label: '外观', hint: '主题、字体、配色', href: '/me/appearance', group: '设定', keywords: 'appearance waiguan' },
  { id: 'points', label: '点数与充值', href: '/me/points', group: '账号', keywords: 'points dianshu' },
  { id: 'invite', label: '邀请返点', href: '/me/invite', group: '账号', keywords: 'invite yaoqing fandian referral' },
  { id: 'notifications', label: '通知', href: '/notifications', group: '账号', keywords: 'notification tongzhi' },
  { id: 'security', label: '账号安全', href: '/me/security', group: '账号', keywords: 'security anquan 2fa' },
];

export function CommandPalette({ recents = [] }: { recents?: { id: number; name: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [found, setFound] = useState<{ id: string; name: string; hook: string }[]>([]);
  // 角色搜索：输入停顿 180ms 后查一次，最多 6 条
  useEffect(() => {
    const q = query.trim();
    if (!q) { setFound([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/characters/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { characters: [] }))
        .then((d) => setFound(d.characters ?? []))
        .catch(() => {});
    }, 180);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);
  const lastFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    lastFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        lastFocus.current = document.activeElement as HTMLElement | null;
        setOpen((value) => !value);
      }
    };
    const onOpen = () => {
      lastFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('tavern:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tavern:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => inputRef.current?.focus());
    document.documentElement.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(t);
      document.documentElement.style.overflow = '';
    };
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const story: Item[] = recents.map((recent) => ({ id: `chat-${recent.id}`, label: recent.name, hint: recent.title, href: `/chats/${recent.id}`, group: '继续故事' }));
    const all = [...story, ...PAGES];
    const matched = q ? all.filter((item) => `${item.label} ${item.hint ?? ''} ${item.keywords ?? ''}`.toLowerCase().includes(q)) : all;
    const chars: Item[] = q ? found.map((c) => ({ id: `char-${c.id}`, label: c.name, hint: c.hook, href: `/c/${c.id}`, group: '角色' })) : [];
    const filtered = [...matched.filter((i) => i.group === '继续故事'), ...chars, ...matched.filter((i) => i.group !== '继续故事')];
    if (q) filtered.push({ id: 'search', label: `搜索「${query.trim()}」`, hint: '角色、作者与剧情', href: `/search?q=${encodeURIComponent(query.trim())}`, group: '搜索' });
    return filtered;
  }, [query, recents, found]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };

  if (!open) return null;

  let lastGroup = '';
  return (
    <div className="rd-palette" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="rd-palette-panel" role="dialog" aria-modal="true" aria-label="快速跳转">
        <div className="rd-palette-search">
          <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" /></svg>
          <input
            ref={inputRef}
            value={query}
            placeholder="跳转到页面、故事，或输入关键词搜索…"
            aria-label="快速跳转"
            aria-controls="rd-palette-list"
            aria-activedescendant={items[active] ? `rd-pal-${items[active].id}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { event.preventDefault(); close(); }
              else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); go(items[active]); }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="rd-palette-list" id="rd-palette-list" role="listbox" ref={listRef}>
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {header && <div className="rd-palette-group">{header}</div>}
                <button
                  id={`rd-pal-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(item)}
                >
                  <span>{item.label}</span>
                  {item.hint && <small>{item.hint}</small>}
                  <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </li>
            );
          })}
          {!items.length && <li className="rd-palette-empty">没有匹配的结果</li>}
        </ul>
        <div className="rd-palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 打开</span><span><kbd>⌘</kbd><kbd>K</kbd> 随时唤起</span></div>
      </div>
    </div>
  );
}
