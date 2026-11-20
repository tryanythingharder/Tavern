'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/settings-ui';
import { AgeGateDialog, type NsfwStateName } from '@/components/age-gate-dialog';

const STATE_TEXT: Record<NsfwStateName, string> = {
  allowed: '',
  guest: '',
  needs_age: '还没填写出生日期，打开前会请你确认一次。',
  needs_verification: '你所在的地区要求先通过第三方年龄验证。',
  underage: '成人向角色仅向成年用户开放。',
  region_blocked: '你所在的地区暂不提供成人向内容。',
  site_off: '本站目前不提供成人向内容。',
};

export function NsfwToggle({ initial, state = 'allowed', minAge = 18, hasBirthDate = true, verified = false }: { initial: boolean; state?: NsfwStateName; minAge?: number; hasBirthDate?: boolean; verified?: boolean }) {
  const router = useRouter();
  const [hide, setHide] = useState(initial || state !== 'allowed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gate, setGate] = useState(false);
  const locked = state === 'site_off' || state === 'region_blocked' || state === 'underage';

  const toggle = async (next: boolean) => {
    if (!next && state !== 'allowed') {
      setGate(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ hideNsfw: next }) });
      setHide(next);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-card p-card--pad" id="age">
      <h2 className="p-form-section-title">内容偏好</h2>
      <label className="p-check">
        <input type="checkbox" checked={hide} disabled={busy || locked} onChange={(event) => void toggle(event.target.checked)} />
        <span>隐藏 18+ 角色<span className="p-small">广场、发现页与搜索结果里不显示</span></span>
      </label>
      {STATE_TEXT[state] && <p className="p-hint">{STATE_TEXT[state]}</p>}
      <p className="p-hint">
        出生日期：{hasBirthDate ? '已填写' : '未填写'}{verified ? ' · 年龄验证：已通过' : ''}。新账号默认隐藏，可以随时打开；成人向内容只向年满 {minAge} 周岁的用户开放，详见 <a href="/guidelines">社区准则</a>。
      </p>
      {error && <p role="alert" className="p-form-error">{error}</p>}
      {gate && (
        <AgeGateDialog
          state={state}
          minAge={minAge}
          onClose={() => setGate(false)}
          onAllowed={() => { setGate(false); setHide(false); router.refresh(); }}
        />
      )}
    </section>
  );
}
