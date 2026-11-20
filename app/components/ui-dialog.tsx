'use client';

import { useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '@/components/settings-ui';

// 站内确认框：替代 window.confirm / alert（原生弹窗不跟主题、也没法本地化按钮）。
// const ok = await askConfirm({ message: '确定删除？', confirmLabel: '删除', danger: true });

type ConfirmOptions = { title?: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; alertOnly?: boolean };

function ConfirmDialog({ options, done }: { options: ConfirmOptions; done: (ok: boolean) => void }) {
  const [closing, setClosing] = useState(false);
  const finish = (ok: boolean) => {
    if (closing) return;
    setClosing(true);
    done(ok);
  };
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return (
    <Modal
      title={options.title ?? (options.alertOnly ? (en ? 'Notice' : '提示') : en ? 'Please confirm' : '请确认')}
      onClose={() => finish(false)}
      footer={
        <>
          {!options.alertOnly && (
            <button className="btn btn--sm" type="button" onClick={() => finish(false)}>{options.cancelLabel ?? (en ? 'Cancel' : '取消')}</button>
          )}
          <button className={`btn btn--sm ${options.danger ? 'btn--danger-solid' : 'btn--primary'}`} type="button" data-autofocus onClick={() => finish(true)}>
            {options.confirmLabel ?? (options.alertOnly ? (en ? 'OK' : '知道了') : en ? 'Confirm' : '确定')}
          </button>
        </>
      }
    >
      <p className="ui-dialog-msg">{options.message}</p>
    </Modal>
  );
}

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const previous = document.activeElement as HTMLElement | null;
    root.render(
      <ConfirmDialog
        options={options}
        done={(ok) => {
          resolve(ok);
          setTimeout(() => {
            root.unmount();
            host.remove();
            previous?.focus?.();
          }, 0);
        }}
      />,
    );
  });
}

export function showAlert(message: string, title?: string): Promise<void> {
  return askConfirm({ message, title, alertOnly: true }).then(() => undefined);
}

// 站内输入框 / 按钮选择：斜杠命令 /input、/buttons 用（替代 window.prompt）
type PromptOptions = { title?: string; message: string; defaultValue?: string; multiline?: boolean; okLabel?: string };

function PromptDialog({ options, done }: { options: PromptOptions; done: (value: string | null) => void }) {
  const [value, setValue] = useState(options.defaultValue ?? '');
  const [closed, setClosed] = useState(false);
  const finish = (result: string | null) => {
    if (closed) return;
    setClosed(true);
    done(result);
  };
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return (
    <Modal
      title={options.title ?? (en ? 'Input' : '请输入')}
      onClose={() => finish(null)}
      footer={
        <>
          <button className="btn btn--sm" type="button" onClick={() => finish(null)}>{en ? 'Cancel' : '取消'}</button>
          <button className="btn btn--sm btn--primary" type="button" onClick={() => finish(value)}>{options.okLabel ?? (en ? 'OK' : '确定')}</button>
        </>
      }
    >
      {options.message && <p className="ui-dialog-msg">{options.message}</p>}
      {options.multiline ? (
        <textarea className="p-input ui-dialog-input" rows={4} value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
      ) : (
        <input
          className="p-input ui-dialog-input"
          value={value}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              finish(value);
            }
          }}
        />
      )}
    </Modal>
  );
}

function ChoiceDialog({ title, message, choices, done }: { title?: string; message: string; choices: string[]; done: (value: string | null) => void }) {
  const [closed, setClosed] = useState(false);
  const finish = (result: string | null) => {
    if (closed) return;
    setClosed(true);
    done(result);
  };
  const en = typeof document !== 'undefined' && document.documentElement.lang === 'en';
  return (
    <Modal title={title ?? (en ? 'Choose' : '请选择')} onClose={() => finish(null)}>
      {message && <p className="ui-dialog-msg">{message}</p>}
      <div className="ui-dialog-choices">
        {choices.map((choice, index) => (
          <button key={`${choice}-${index}`} className="btn btn--sm" type="button" onClick={() => finish(choice)}>{choice}</button>
        ))}
      </div>
    </Modal>
  );
}

function mount<T>(render: (done: (value: T) => void) => ReactElement): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const previous = document.activeElement as HTMLElement | null;
    root.render(
      render((value) => {
        resolve(value);
        setTimeout(() => {
          root.unmount();
          host.remove();
          previous?.focus?.();
        }, 0);
      }),
    );
  });
}

/** 返回输入的文字；取消返回 null */
export function askPrompt(options: PromptOptions): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return mount<string | null>((done) => <PromptDialog options={options} done={done} />);
}

/** 返回选中的按钮文字；关掉返回 null */
export function askChoice(message: string, choices: string[], title?: string): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return mount<string | null>((done) => <ChoiceDialog title={title} message={message} choices={choices} done={done} />);
}
