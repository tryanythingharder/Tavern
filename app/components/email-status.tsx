'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function EmailStatus({ email, verified }: { email: string; verified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ preview?: string }>('/api/auth/verify/resend', { method: 'POST', body: '{}' });
      setSent(true);
      setPreview(result.preview ?? '');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="p-small" style={{ marginTop: 0 }}>
        登录邮箱：<strong>{email}</strong>{' '}
        <span className={`p-pill p-pill--sm ${verified ? 'p-pill--ok' : 'p-pill--warn'}`}>{verified ? '已验证' : '未验证'}</span>
      </p>
      {verified ? (
        <p className="p-hint" style={{ margin: 0 }}>邮箱已验证，可以用于找回密码。</p>
      ) : (
        <>
          <p className="p-hint">验证后可以更安全地找回密码，也会收到审核结果通知。链接 24 小时内有效。</p>
          {sent && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>验证邮件已发送。没收到？检查垃圾邮件，或一分钟后再试。</p>}
          {preview && <p className="p-hint">开发模式：邮件已写入 <code>{preview}</code>。</p>}
          {error && <p className="p-form-error" role="alert">{error}</p>}
          <button className="p-btn p-btn--sm" type="button" disabled={busy || sent} onClick={() => void resend()}>
            {busy ? '发送中…' : sent ? '已发送' : '发送验证邮件'}
          </button>
        </>
      )}
    </div>
  );
}
