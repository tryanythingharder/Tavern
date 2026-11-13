'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function EmailChangeVerify({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/email', { method: 'POST', body: JSON.stringify({ token }) });
      setDone(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="p-auth-form">
        <p className="p-auth-lead">邮箱已更换。为了安全，所有设备都已退出登录。</p>
        <Link className="p-btn p-btn--primary p-auth-button" href="/login?mode=login">用新邮箱登录</Link>
      </div>
    );
  }

  return (
    <div className="p-auth-form">
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <p className="p-auth-hint">确认后这个地址会成为你的登录邮箱，所有旧设备会退出。</p>
      <button className="p-btn p-btn--primary p-auth-button" type="button" disabled={busy} onClick={() => void confirm()}>
        {busy ? '确认中…' : '确认更换邮箱'}
      </button>
    </div>
  );
}
