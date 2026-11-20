'use client';

import { useState } from 'react';
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
