'use client';

import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// 站内下拉框：替代浏览器原生 <select> 的弹出列表（原生列表的样式没法跟主题走）。
// 用法和 <select> 一样：子元素写 <option>/<optgroup>，onChange 收到 { target: { value } }，旧代码改个标签名即可。
// 键盘：↑↓/Home/End 移动，Enter/空格选中，Esc/Tab 关闭，打字跳到开头匹配的项。

type Opt = { value: string; label: string; disabled: boolean; group?: string };

type SelectProps = {
  value?: string | number | null;
  defaultValue?: string | number;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  children?: ReactNode;
  id?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  title?: string;
  required?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ value?: unknown; children?: ReactNode; disabled?: boolean; label?: string }>;
    if (element.type === 'optgroup') collect(element.props.children, element.props.label ?? '', out);
    else if (element.type === 'option') {
      const label = textOf(element.props.children);
      out.push({ value: element.props.value === undefined ? label : String(element.props.value), label, disabled: !!element.props.disabled, group });
    } else if (element.props.children) collect(element.props.children, group, out);
  });
  return out;
}

export function Select({ value, defaultValue, onChange, children, id, name, className, style, disabled, title, ...aria }: SelectProps) {
  const options = useMemo(() => collect(children), [children]);
  const [inner, setInner] = useState(defaultValue === undefined ? options[0]?.value ?? '' : String(defaultValue));
  const current = value === undefined ? inner : value === null ? '' : String(value);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === current));
  const selected = options[selectedIndex];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: '', at: 0 });
  const autoId = useId();
  const listId = `${autoId}-list`;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const want = Math.min(320, options.length * 38 + 10);
    const up = below < Math.min(want, 200) && above > below;
    setPos({ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8)), top: up ? rect.top - 4 : rect.bottom + 4, width: rect.width, maxHeight: Math.max(120, Math.min(320, up ? above : below)), up });
  }, [options.length]);

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  }, []);

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (value === undefined) setInner(option.value);
    if (option.value !== current) {
      const target = { value: option.value, name: name ?? '', id: id ?? '' } as unknown as HTMLSelectElement;
      onChange?.({ target, currentTarget: target, preventDefault() {}, stopPropagation() {} } as unknown as ChangeEvent<HTMLSelectElement>);
      // 再从触发器冒泡一个原生 change：外层靠原生事件感知改动的容器（如后台配置页的未保存提醒 UnsavedGuard）才能知道值变了。
      // React 不会把 div 上的原生 change 合成为 onChange，所以不会重复触发上面的回调。
      triggerRef.current?.dispatchEvent(new Event('change', { bubbles: true }));
    }
    close();
  };

  const openList = () => {
    if (disabled || !options.length) return;
    setActive(selectedIndex);
    place();
    setOpen(true);
  };

  // <label htmlFor> 点了要像原生 select 一样聚焦
  useEffect(() => {
    if (!id) return;
    const onClick = (event: MouseEvent) => {
      const label = (event.target as HTMLElement | null)?.closest?.('label');
      if (label && label.htmlFor === id && !disabled) triggerRef.current?.focus();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [id, disabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (list && item) {
      if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop - 4;
      else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + 4;
    }
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    };
    const openedAt = performance.now();
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      // 刚打开时页面可能还在把触发器滚进视野（吸顶工具栏、键盘聚焦），那一下不算用户滚动
      if (performance.now() - openedAt < 150) return;
      close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const step = (from: number, delta: number) => {
    let index = from;
    for (let i = 0; i < options.length; i += 1) {
      index = Math.min(options.length - 1, Math.max(0, index + delta));
      if (!options[index]?.disabled) return index;
      if (index === 0 || index === options.length - 1) break;
    }
    return from;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const key = event.key;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // 别把外层弹窗一起关了（弹窗的 Esc 监听也在 document 上，要立即停止）
      event.nativeEvent.stopImmediatePropagation();
      close();
    } else if (key === 'Tab') close(false);
    else if (key === 'ArrowDown') { event.preventDefault(); setActive((index) => step(index, 1)); }
    else if (key === 'ArrowUp') { event.preventDefault(); setActive((index) => step(index, -1)); }
    else if (key === 'Home') { event.preventDefault(); setActive(step(-1, 1)); }
    else if (key === 'End') { event.preventDefault(); setActive(step(options.length, -1)); }
    else if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(active); }
    else if (key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(), at: now };
      const hit = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  let lastGroup: string | undefined;
  const list = open && pos && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className={`ui-select-pop${pos.up ? ' is-up' : ''}`}
          aria-labelledby={id}
          style={{ left: pos.left, minWidth: pos.width, maxHeight: pos.maxHeight, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
          onPointerDown={(event) => event.preventDefault()}
        >
          {options.map((option, index) => {
            const heading = option.group !== undefined && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;
            return (
              <div key={`${option.group ?? ''}:${option.value}:${index}`} role="presentation">
                {heading !== null && <div className="ui-select-group" role="presentation">{heading}</div>}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  data-index={index}
                  aria-selected={index === selectedIndex}
                  aria-disabled={option.disabled || undefined}
                  className={`ui-select-opt${index === active ? ' is-active' : ''}${index === selectedIndex ? ' is-selected' : ''}`}
                  onPointerEnter={() => !option.disabled && setActive(index)}
                  onClick={() => choose(index)}
                >
                  <span>{option.label || '\u00a0'}</span>
                  {index === selectedIndex && (
                    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {/* ARIA 1.2 「只能选」组合框：用 div 而不是 button，免得主题里的按钮样式套上来 */}
      <div
        ref={triggerRef}
        id={id}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        className={`${className ?? 'select'} ui-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}`}
        style={style}
        title={title}
        aria-disabled={disabled || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={aria['aria-describedby']}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="ui-select-value">{selected?.label || '\u00a0'}</span>
        <svg className="ui-select-caret" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </div>
      {name && <input type="hidden" name={name} value={current} />}
      {list}
    </>
  );
}
