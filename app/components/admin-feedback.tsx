'use client';

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '@/components/settings-ui';

// 后台统一反馈：右下角 toast（成功/失败/带「撤销」的延迟执行）+ 后台样式的确认弹窗。
// 用法：toast.ok('已保存')；toast.err(message)；await confirmAction({ message, danger: true })；
//      undoable({ text: '已通过 3 个作品', run: () => api(...) }) —— 6 秒内可撤销，之后才真正发请求。

type ToastKind = 'ok' | 'err' | 'info';
type ToastItem = { id: number; kind: ToastKind; text: string; action?: { label: string; onClick: () => void }; duration: number };

let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<(list: ToastItem[]) => void>();
const emit = () => listeners.forEach((fn) => fn(items));

function push(kind: ToastKind, text: string, options: { action?: ToastItem['action']; duration?: number } = {}): number {
  const id = ++seq;
  const duration = options.duration ?? (kind === 'err' ? 7000 : 3500);
  // 同样的文字连续出现只留一条，避免连点刷屏
  items = [...items.filter((item) => item.text !== text), { id, kind, text, action: options.action, duration }].slice(-4);
  emit();
  return id;
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export const toast = {
  ok: (text: string, options?: { action?: ToastItem['action']; duration?: number }) => push('ok', text, options),
  err: (text: string) => push('err', text),
  info: (text: string, options?: { action?: ToastItem['action']; duration?: number }) => push('info', text, options),
  dismiss,
};

// ── 延迟执行 + 撤销 ──
type Pending = { run: () => Promise<unknown>; timer: ReturnType<typeof setTimeout>; toastId: number; onDone?: (ok: boolean, error?: string) => void };
const pending = new Map<number, Pending>();

async function fire(key: number) {
  const job = pending.get(key);
  if (!job) return;
  pending.delete(key);
  clearTimeout(job.timer);
  dismiss(job.toastId);
  try {
    await job.run();
    job.onDone?.(true);
  } catch (caught) {
    const message = (caught as Error).message || '操作失败';
    toast.err(message);
    job.onDone?.(false, message);
  }
}

if (typeof window !== 'undefined') {
  // 关页/刷新时把还在撤销窗口里的操作立刻发出去（run 里的 fetch 带 keepalive）
  window.addEventListener('pagehide', () => { for (const key of [...pending.keys()]) void fire(key); });
}

export function undoable({ text, run, onUndo, onDone, delay = 6000 }: {
  text: string;
  run: () => Promise<unknown>;
  onUndo?: () => void;
  onDone?: (ok: boolean, error?: string) => void;
  delay?: number;
}): void {
  const key = ++seq;
  const toastId = push('info', text, {
    duration: delay,
    action: {
      label: '撤销',
      onClick: () => {
        const job = pending.get(key);
        if (!job) return;
        clearTimeout(job.timer);
        pending.delete(key);
        dismiss(job.toastId);
        onUndo?.();
        toast.info('已撤销');
      },
    },
  });
  pending.set(key, { run, toastId, onDone, timer: setTimeout(() => void fire(key), delay) });
}

function ToastView({ item }: { item: ToastItem }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || item.action) return;
    const timer = setTimeout(() => dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item, paused]);
  return (
    <div
      className={`a-toast a-toast--${item.kind}`}
      role={item.kind === 'err' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="a-toast-dot" aria-hidden="true" />
      <span className="a-toast-text">{item.text}</span>
      {item.action && (
        <button type="button" className="a-toast-action" onClick={item.action.onClick}>{item.action.label}</button>
      )}
      <button type="button" className="a-toast-close" aria-label="关闭提示" onClick={() => dismiss(item.id)}>×</button>
      {item.action && <span className="a-toast-timer" style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />}
    </div>
  );
}

export function AdminToaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => { listeners.delete(setList); };
  }, []);
  return (
    <div className="a-toasts" aria-live="polite">
      {list.map((item) => <ToastView key={item.id} item={item} />)}
    </div>
  );
}

// ── 确认弹窗（后台 p-btn 样式；可要求输入确认词） ──
type ConfirmOptions = { title?: string; message: string; detail?: string; confirmLabel?: string; danger?: boolean; typeToConfirm?: string };

function ConfirmView({ options, done }: { options: ConfirmOptions; done: (ok: boolean) => void }) {
  const [typed, setTyped] = useState('');
  const blocked = Boolean(options.typeToConfirm) && typed.trim() !== options.typeToConfirm;
  return (
    <Modal
      title={options.title ?? '请确认'}
      onClose={() => done(false)}
      footer={
        <>
          <button className="p-btn p-btn--sm" type="button" onClick={() => done(false)}>取消</button>
          <button className={`p-btn p-btn--sm ${options.danger ? 'p-btn--danger' : 'p-btn--primary'}`} type="button" disabled={blocked} data-confirm="ok" onClick={() => done(true)}>
            {options.confirmLabel ?? '确定'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, lineHeight: 1.7 }}>{options.message}</p>
      {options.detail && <p className="p-small" style={{ margin: '0 0 8px' }}>{options.detail}</p>}
      {options.typeToConfirm && (
        <div className="p-field">
          <label htmlFor="a-confirm-type">输入「{options.typeToConfirm}」以确认</label>
          <input id="a-confirm-type" className="p-input" value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
        </div>
      )}
    </Modal>
  );
}

function mount<T>(render: (done: (value: T) => void) => ReactElement): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const previous = document.activeElement as HTMLElement | null;
    let settled = false;
    root.render(render((value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      setTimeout(() => { root.unmount(); host.remove(); previous?.focus?.(); }, 0);
    }));
  });
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return mount<boolean>((done) => <ConfirmView options={options} done={done} />);
}

// ── 未保存提醒 ──
// 配置页容器里任何输入都会标记「有未保存改动」；保存成功（useNotice 发出的成功提示）清掉标记。
let dirty = false;
export function markDirty() { dirty = true; }
export function markSaved() { dirty = false; }
export function isDirty() { return dirty; }

/** 替代各组件里的 `const [notice, setNotice] = useState('')`：成功文字走 toast，同时清掉未保存标记 */
export function useNotice() {
  return useCallback((message: string) => {
    if (!message) return;
    markSaved();
    toast.ok(message);
  }, []);
}

/** 挂在配置页外层：监听输入标脏；离开页面（刷新/关闭/点站内链接）时提醒 */
export function UnsavedGuard({ children }: { children: ReactElement | ReactElement[] }) {
  useEffect(() => {
    markSaved();
    const onBefore = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (!dirty || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.getAttribute('href')?.startsWith('#')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      void confirmAction({ title: '有未保存的改动', message: '这一页的改动还没保存，离开后会丢失。', confirmLabel: '不保存，离开', danger: true }).then((ok) => {
        if (!ok) return;
        markSaved();
        location.assign(url.href);
      });
    };
    window.addEventListener('beforeunload', onBefore);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      document.removeEventListener('click', onClick, true);
      markSaved();
    };
  }, []);
  return (
    <div
      data-unsaved-scope=""
      onInput={(event) => { if (!(event.target as HTMLElement).closest('[data-no-dirty]')) markDirty(); }}
      onChange={(event) => { if (!(event.target as HTMLElement).closest('[data-no-dirty]')) markDirty(); }}
    >
      {children}
    </div>
  );
}
