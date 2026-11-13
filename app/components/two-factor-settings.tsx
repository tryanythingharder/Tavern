'use client';

import { useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';

type Status = { enabled: boolean; recoveryRemaining: number };
type Setup = { secret: string; otpauth: string; recoveryCodes: string[] };

export function TwoFactorSettings({ initial, required }: { initial: Status; required?: boolean }) {
  const [status, setStatus] = useState(initial);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const begin = async () => {
    setBusy('setup');
    setError('');
    setNotice('');
    try {
      const result = await api<Setup>('/api/me/2fa', { method: 'POST', body: JSON.stringify({ action: 'setup' }) });
      setSetup(result);
      setCode('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const enable = async () => {
    setBusy('enable');
    setError('');
    try {
      await api('/api/me/2fa', { method: 'POST', body: JSON.stringify({ action: 'enable', code }) });
      setStatus({ enabled: true, recoveryRemaining: setup?.recoveryCodes.length ?? 8 });
      setSetup(null);
      setCode('');
      setNotice('两步验证已开启。下次登录会要求输入验证码。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disable = async () => {
    setBusy('disable');
    setError('');
    setNotice('');
    try {
      await api('/api/me/2fa', { method: 'POST', body: JSON.stringify({ action: 'disable', password, code }) });
      setStatus({ enabled: false, recoveryRemaining: 0 });
      setPassword('');
      setCode('');
      setNotice('两步验证已关闭。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className={`p-pill p-pill--sm ${status.enabled ? 'p-pill--ok' : 'p-pill--warn'}`}>{status.enabled ? '已开启' : '未开启'}</span>
        {status.enabled && <span className="p-small">剩余恢复码 {status.recoveryRemaining} 个</span>}
      </div>
      <p className="p-small" style={{ marginTop: 8 }}>
        用任意 TOTP 验证器（Google Authenticator、1Password、Authy 等）扫码或手动输入密钥。开启后登录需要第二步验证。
      </p>
      {required && !status.enabled && (
        <p className="p-form-error" role="alert">管理员账号必须开启两步验证后才能进入后台。</p>
      )}
      <ErrorLine message={error} />
      {notice && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>{notice}</p>}

      {!status.enabled && !setup && (
        <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'setup'} onClick={() => void begin()}>
          {busy === 'setup' ? '生成中…' : '开启两步验证'}
        </button>
      )}

      {!status.enabled && setup && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div className="p-field">
            <label>手动输入密钥</label>
            <code className="p-input" style={{ display: 'flex', alignItems: 'center', letterSpacing: '.08em' }}>{setup.secret}</code>
            <span className="p-small">在验证器里选择「手动输入」，账号填你的邮箱，密钥粘贴上面这串。</span>
          </div>
          <details>
            <summary className="p-small" style={{ cursor: 'pointer' }}>显示 otpauth 链接</summary>
            <code className="p-small" style={{ display: 'block', wordBreak: 'break-all', marginTop: 6 }}>{setup.otpauth}</code>
          </details>
          <div className="p-field">
            <label>恢复码（只显示这一次，请离线保存）</label>
            <div className="p-small" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 4 }}>
              {setup.recoveryCodes.map((item) => <code key={item}>{item}</code>)}
            </div>
          </div>
          <div className="p-field">
            <label htmlFor="twofa-enable-code">输入验证器当前 6 位验证码确认</label>
            <input id="twofa-enable-code" className="p-input" value={code} inputMode="numeric" maxLength={6} placeholder="123456" onChange={(event) => setCode(event.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy === 'enable' || code.trim().length !== 6} onClick={() => void enable()}>
              {busy === 'enable' ? '确认中…' : '确认开启'}
            </button>
            <button className="p-btn p-btn--sm" type="button" onClick={() => { setSetup(null); setCode(''); }}>取消</button>
          </div>
        </div>
      )}

      {status.enabled && (
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <div className="p-field">
            <label htmlFor="twofa-disable-password">关闭两步验证 · 当前密码</label>
            <input id="twofa-disable-password" className="p-input" type="password" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
          </div>
          <div className="p-field">
            <label htmlFor="twofa-disable-code">验证码或恢复码</label>
            <input id="twofa-disable-code" className="p-input" value={code} maxLength={12} placeholder="123456 或 XXXX-XXXX" onChange={(event) => setCode(event.target.value)} />
          </div>
          <button className="p-btn p-btn--sm p-btn--danger" type="button" style={{ justifySelf: 'start' }} disabled={busy === 'disable' || !password || code.trim().length < 6} onClick={() => void disable()}>
            {busy === 'disable' ? '关闭中…' : '关闭两步验证'}
          </button>
        </div>
      )}
    </div>
  );
}
