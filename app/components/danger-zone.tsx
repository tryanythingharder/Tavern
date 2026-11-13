'use client';

import { useState } from 'react';
import { Modal, api } from '@/components/settings-ui';

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/me/delete', { method: 'POST', body: JSON.stringify({ password }) });
      window.location.href = '/';
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <button className="p-btn p-btn--danger" type="button" onClick={() => { setOpen(true); setPassword(''); setError(''); }}>注销账号</button>
      {open && (
        <Modal
          title="注销账号？"
          onClose={() => { if (!busy) setOpen(false); }}
          footer={
            <>
              <button className="btn btn--sm" type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
              <button className="btn btn--sm btn--danger" type="button" disabled={busy || !password} onClick={() => void remove()}>{busy ? '删除中…' : '永久删除账号'}</button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>这会永久删除你的账号，以及角色、会话、房间、身份、预设、世界书、收藏、点数记录和通知。无法恢复。</p>
          <p className="small">想保留内容？先到「安全与隐私」下载「导出我的数据」。</p>
          {error && <p className="p-form-error" role="alert">{error}</p>}
          <div className="field">
            <label>输入当前密码确认</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>
        </Modal>
      )}
    </>
  );
}
