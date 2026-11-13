'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function TwoFactorLogin({ token }: { token: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/2fa', { method: 'POST', body: JSON.stringify({ token, code }) });
      // 完整刷新，让新会话 cookie 和站点外壳一起生效
      window.location.href = '/';
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="p-auth-form" onSubmit={(event) => void submit(event)}>
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <div className="p-auth-field">
        <label className="p-auth-label" htmlFor="twofa-code">6 位验证码或恢复码</label>
        <input
          className="p-auth-input"
          id="twofa-code"
          value={code}
          autoFocus
          autoComplete="one-time-code"
          inputMode="text"
          maxLength={12}
          placeholder="123456 或 XXXX-XXXX"
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <span className="p-auth-hint">打开验证器 App 查看当前验证码；设备丢失时可用一次性恢复码。</span>
      <button className="p-btn p-btn--primary p-auth-button" type="submit" disabled={busy || code.trim().length < 6}>
        {busy ? '验证中…' : '完成登录'}
      </button>
    </form>
  );
}
