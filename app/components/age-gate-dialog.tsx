'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

export type NsfwStateName = 'allowed' | 'site_off' | 'region_blocked' | 'guest' | 'needs_age' | 'underage' | 'needs_verification';

type AgeInfo = { state: NsfwStateName; allowed: boolean; show: boolean; message: string; canVerify: boolean };

// 打开「显示 18+」的统一流程：
//   allowed → 直接打开；needs_age → 填出生日期（只填一次）；needs_verification → 跳第三方验证；
//   guest → 去登录；其它（全站关闭 / 地区不提供 / 未满年龄）只给说明
export function AgeGateDialog({ state, minAge = 18, onClose, onAllowed }: { state: NsfwStateName; minAge?: number; onClose: () => void; onAllowed: () => void }) {
  const [current, setCurrent] = useState<NsfwStateName>(state);
  const [birth, setBirth] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitBirth = async () => {
    if (!birth) return setError('请填写出生日期');
    if (!confirmed) return setError('请确认出生日期真实');
    setBusy(true);
    setError('');
    try {
      const data = await api<AgeInfo>('/api/me/age', { method: 'POST', body: JSON.stringify({ birthDate: birth, show: true }) });
      if (data.allowed) {
        onAllowed();
        return;
      }
      setCurrent(data.state);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startVerify = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await api<{ url: string }>('/api/me/age/verify', { method: 'POST' });
      window.location.href = data.url;
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const close = <button className="btn btn--sm" type="button" onClick={onClose}>{current === 'needs_age' || current === 'needs_verification' ? '取消' : '知道了'}</button>;

  if (current === 'needs_age') {
    return (
      <Modal
        title="确认年龄"
        onClose={onClose}
        footer={<>{close}<button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void submitBirth()}>{busy ? '提交中…' : '确认并显示'}</button></>}
      >
        <p className="small" style={{ marginTop: 0 }}>成人向角色仅向年满 {minAge} 周岁的用户开放。出生日期只需填一次，之后不能自己修改。</p>
        <label className="p-age-field">
          <span>出生日期</span>
          <input className="p-input" type="date" min="1900-01-01" max={today} value={birth} onChange={(event) => { setBirth(event.target.value); setError(''); }} />
        </label>
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setError(''); }} />
          <span>我确认出生日期真实，并愿意浏览成人向内容</span>
        </label>
        <ErrorLine message={error} />
      </Modal>
    );
  }

  if (current === 'needs_verification') {
    return (
      <Modal
        title="需要年龄验证"
        onClose={onClose}
        footer={<>{close}<button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void startVerify()}>{busy ? '跳转中…' : '去验证'}</button></>}
      >
        <p className="small" style={{ marginTop: 0 }}>按你所在地区的法律要求，使用成人向角色前需要通过第三方年龄验证。验证由服务商完成，本站只记录是否通过。</p>
        <ErrorLine message={error} />
      </Modal>
    );
  }

  const text: Record<string, string> = {
    guest: '成人向角色需要登录并确认年龄后才能浏览。',
    site_off: '本站目前不提供成人向内容。',
    region_blocked: '按你所在地区的法律要求，本站在当地不提供成人向内容。',
    underage: `成人向角色仅向年满 ${minAge} 周岁的用户开放。`,
    allowed: '',
  };
  return (
    <Modal
      title="成人向内容"
      onClose={onClose}
      footer={<>{close}{current === 'guest' && <Link className="btn btn--sm btn--primary" href="/login">登录 / 注册</Link>}</>}
    >
      <p className="small" style={{ marginTop: 0 }}>{text[current]}</p>
    </Modal>
  );
}

// 角色页等处的「打开 18+」按钮：能看就直接改偏好，不能看就走年龄流程
export function AgeGateButton({ state, minAge = 18, label, className = 'btn btn--sm' }: { state: NsfwStateName; minAge?: number; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const click = async () => {
    if (state !== 'allowed') return setOpen(true);
    try {
      await api('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ hideNsfw: false }) });
      window.location.reload();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  return (
    <>
      <button className={className} type="button" onClick={() => void click()}>{label}</button>
      {error && <span role="alert" className="p-form-error">{error}</span>}
      {open && <AgeGateDialog state={state} minAge={minAge} onClose={() => setOpen(false)} onAllowed={() => window.location.reload()} />}
    </>
  );
}
