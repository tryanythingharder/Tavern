'use client';

import { useState, type ReactNode } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';

const REASONS = ['色情或暴力', '侵犯版权', '骚扰或仇恨', '欺诈或误导', '其他'];

export function ReportButton({
  targetType,
  targetId,
  label = '举报',
  className = 'btn btn--sm btn--ghost',
  icon,
}: {
  targetType: 'character' | 'message' | 'user' | 'comment';
  targetId: string | number;
  label?: string;
  className?: string;
  /** 给了图标就只显示图标（和消息工具栏其它按钮一致），文字进 aria-label / title */
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/reports', { method: 'POST', body: JSON.stringify({ targetType, targetId: String(targetId), reason, note }) });
      setDone(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={className}
        type="button"
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        onClick={() => { setOpen(true); setDone(false); setNote(''); }}
      >
        {icon ?? label}
      </button>
      {open && (
        <Modal
          title="举报"
          onClose={() => setOpen(false)}
          footer={
            done ? (
              <button className="btn btn--sm btn--primary" type="button" onClick={() => setOpen(false)}>关闭</button>
            ) : (
              <>
                <button className="btn btn--sm" type="button" onClick={() => setOpen(false)}>取消</button>
                <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? '提交中…' : '提交举报'}</button>
              </>
            )
          }
        >
          <ErrorLine message={error} />
          {done ? (
            <p className="small" style={{ margin: 0 }}>已收到你的举报，管理员会尽快处理。处理结果会通过站内通知告诉你。</p>
          ) : (
            <>
              <div className="field">
                <label>原因</label>
                <Select className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
                  {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              </div>
              <div className="field">
                <label>补充说明（可选）</label>
                <textarea className="textarea" rows={4} value={note} maxLength={500} placeholder="发生了什么？" onChange={(event) => setNote(event.target.value)} />
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
