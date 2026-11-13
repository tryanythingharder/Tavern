'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/components/settings-ui';

function Field({ id, label, type, value, onChange, autoComplete, placeholder }: {
  id: string; label: string; type: string; value: string; onChange: (value: string) => void; autoComplete?: string; placeholder?: string;
}) {
  return (
    <div className="p-auth-field">
      <label className="p-auth-label" htmlFor={id}>{label}</label>
      <input
        className="p-auth-input"
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<{ preview?: string }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
      setPreview(result.preview ?? '');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="p-auth-form">
        <p className="p-auth-lead">如果这个邮箱注册过，重置链接已经发出，1 小时内有效。</p>
        <p className="p-auth-hint">没收到？检查垃圾邮件，或稍后重新申请。也可以联系管理员。</p>
        {preview && <p className="p-auth-hint">开发模式：邮件已写入 <code>{preview}</code>。</p>}
        <p className="p-auth-hint"><Link href="/login?mode=login">返回登录</Link></p>
      </div>
    );
  }

  return (
    <form className="p-auth-form" onSubmit={(event) => void submit(event)}>
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <Field id="forgot-email" label="注册邮箱" type="email" value={email} autoComplete="email" placeholder="you@example.com" onChange={setEmail} />
      <button className="p-btn p-btn--primary p-auth-button" type="submit" disabled={busy || !email.trim()}>
        {busy ? '发送中…' : '发送重置链接'}
      </button>
      <p className="p-auth-hint">想起来了？<Link href="/login?mode=login">返回登录</Link></p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('新密码至少 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
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
        <p className="p-auth-lead">密码已重置，所有旧设备都已退出登录。</p>
        <Link className="p-btn p-btn--primary p-auth-button" href="/login?mode=login">去登录</Link>
      </div>
    );
  }

  return (
    <form className="p-auth-form" onSubmit={(event) => void submit(event)}>
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <Field id="reset-password" label="新密码" type="password" value={password} autoComplete="new-password" onChange={setPassword} />
      <Field id="reset-confirm" label="再输入一次" type="password" value={confirm} autoComplete="new-password" onChange={setConfirm} />
      <span className="p-auth-hint">至少 8 位；重置后需要重新登录。</span>
      <button className="p-btn p-btn--primary p-auth-button" type="submit" disabled={busy || !password || !confirm}>
        {busy ? '重置中…' : '设置新密码'}
      </button>
    </form>
  );
}

export function VerifyForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
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
        <p className="p-auth-lead">邮箱已验证。现在可以用它找回密码，也会收到审核结果通知。</p>
        <Link className="p-btn p-btn--primary p-auth-button" href="/me">回到我的</Link>
      </div>
    );
  }

  return (
    <div className="p-auth-form">
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <p className="p-auth-hint">点击下面的按钮完成验证。链接 24 小时内有效，只能使用一次。</p>
      <button className="p-btn p-btn--primary p-auth-button" type="button" disabled={busy} onClick={() => void verify()}>
        {busy ? '验证中…' : '验证邮箱'}
      </button>
      <p className="p-auth-hint">链接过期了？<Link href="/me">去「我的」重新发送</Link></p>
    </div>
  );
}
