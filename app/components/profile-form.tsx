'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Modal, api } from '@/components/settings-ui';

export function ProfileForm({ nickname, email, bio }: { nickname: string; email: string; bio: string }) {
  const router = useRouter();
  const [value, setValue] = useState(nickname);
  const [bioValue, setBioValue] = useState(bio);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // 修改密码
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordDone, setPasswordDone] = useState(false);

  // 更换邮箱
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const changeEmail = async () => {
    setEmailBusy(true);
    setEmailError('');
    try {
      await api('/api/me/email', { method: 'POST', body: JSON.stringify({ email: newEmail, password: emailPassword }) });
      setEmailSent(true);
      setEmailPassword('');
    } catch (caught) {
      setEmailError((caught as Error).message);
    } finally {
      setEmailBusy(false);
    }
  };

  const changePassword = async () => {
    if (nextPassword.length < 8) {
      setPasswordError('新密码至少 8 位');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }
    setPasswordBusy(true);
    setPasswordError('');
    try {
      await api('/api/me/password', { method: 'POST', body: JSON.stringify({ current: currentPassword, next: nextPassword }) });
      setPasswordDone(true);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
    } catch (caught) {
      setPasswordError((caught as Error).message);
    } finally {
      setPasswordBusy(false);
    }
  };

  const dirty = value.replace(/\s+/g, ' ').trim() !== nickname || bioValue.trim() !== bio;

  const save = async () => {
    const next = value.replace(/\s+/g, ' ').trim();
    if (!next) {
      setError('昵称不能为空');
      return;
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/api/me/profile', { method: 'PATCH', body: JSON.stringify({ nickname: next, bio: bioValue }) });
      setValue(next);
      setBioValue(bioValue.trim());
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="p-card p-card--pad">
      <div className="p-acct">
        <span className="p-avatar" style={{ ['--size' as string]: '64px', ['--h' as string]: 28 }}>{Array.from(nickname)[0] ?? '我'}</span>
        <div className="p-acct-id">
          <strong>{nickname}</strong>
          <span>{email} · 已登录</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="p-btn p-btn--sm" type="button" onClick={() => { setEmailOpen(true); setEmailSent(false); setEmailError(''); setNewEmail(''); }}>更换邮箱</button>
          <button className="p-btn p-btn--sm" type="button" onClick={() => { setPasswordOpen(true); setPasswordDone(false); setPasswordError(''); }}>修改密码</button>
        </div>
      </div>
      <div className="p-field" style={{ marginTop: 20 }}>
        <label className="p-label" htmlFor="profile-nickname">昵称</label>
        <input
          id="profile-nickname"
          className="p-input"
          maxLength={24}
          value={value}
          onChange={(event) => { setValue(event.target.value); setSaved(false); }}
        />
        <span className="p-hint">用于新作品署名与评论展示。</span>
      </div>
      <div className="p-field" style={{ marginTop: 20 }}>
        <label className="p-label" htmlFor="profile-bio">作者简介</label>
        <textarea
          id="profile-bio"
          className="p-textarea"
          rows={3}
          maxLength={200}
          value={bioValue}
          placeholder="写一两句关于你的创作：喜欢写什么、在意什么。"
          onChange={(event) => { setBioValue(event.target.value); setSaved(false); }}
        />
        <span className="p-hint">会显示在你的作者主页；留空则不展示。最多 200 字。</span>
      </div>
      <div className="p-acct-actions">
        <button className="p-btn" type="button" disabled={busy || !value.trim() || !dirty} onClick={() => void save()}>
          {busy ? '保存中…' : saved ? '已保存' : '保存修改'}
        </button>
      </div>
      {error && <p className="p-form-error" role="alert">{error}</p>}
    </div>

    {passwordOpen && (
      <Modal
        title="修改密码"
        onClose={() => { if (!passwordBusy) setPasswordOpen(false); }}
        footer={
          passwordDone ? (
            <button className="btn btn--sm btn--primary" type="button" onClick={() => setPasswordOpen(false)}>关闭</button>
          ) : (
            <>
              <button className="btn btn--sm" type="button" disabled={passwordBusy} onClick={() => setPasswordOpen(false)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={passwordBusy} onClick={() => void changePassword()}>{passwordBusy ? '修改中…' : '确认修改'}</button>
            </>
          )
        }
      >
        {passwordDone ? (
          <p style={{ margin: 0 }}>密码已修改，下次登录请使用新密码。</p>
        ) : (
          <>
            {passwordError && <p className="p-form-error" role="alert">{passwordError}</p>}
            <div className="field">
              <label>当前密码</label>
              <input className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
            </div>
            <div className="field">
              <label>新密码</label>
              <input className="input" type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
              <span className="hint">至少 8 位。</span>
            </div>
            <div className="field">
              <label>再输入一次新密码</label>
              <input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
          </>
        )}
      </Modal>
    )}

    {emailOpen && (
      <Modal
        title="更换邮箱"
        onClose={() => { if (!emailBusy) setEmailOpen(false); }}
        footer={
          emailSent ? (
            <button className="p-btn p-btn--sm p-btn--primary" type="button" onClick={() => setEmailOpen(false)}>关闭</button>
          ) : (
            <>
              <button className="p-btn p-btn--sm" type="button" disabled={emailBusy} onClick={() => setEmailOpen(false)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={emailBusy || !newEmail.trim() || !emailPassword} onClick={() => void changeEmail()}>
                {emailBusy ? '发送中…' : '发送确认邮件'}
              </button>
            </>
          )
        }
      >
        {emailSent ? (
          <p style={{ margin: 0 }}>确认邮件已发到新邮箱。打开链接确认后，旧邮箱会失效，所有设备需要重新登录。</p>
        ) : (
          <>
            {emailError && <p className="p-form-error" role="alert">{emailError}</p>}
            <div className="field">
              <label htmlFor="new-email">新邮箱</label>
              <input id="new-email" className="input" type="email" autoComplete="email" value={newEmail} placeholder="new@example.com" onChange={(event) => setNewEmail(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="email-password">当前密码</label>
              <input id="email-password" className="input" type="password" autoComplete="current-password" value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} />
            </div>
            <p className="small" style={{ margin: 0 }}>需要当前密码确认；新邮箱收到确认链接后才会生效。</p>
          </>
        )}
      </Modal>
    )}
    </>
  );
}
