'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function NsfwToggle({ initial }: { initial: boolean }) {
  const [hide, setHide] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async (next: boolean) => {
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
    <section className="p-card p-card--pad">
      <h2 className="p-form-section-title">内容偏好</h2>
      <label className="p-check">
        <input type="checkbox" checked={hide} disabled={busy} onChange={(event) => void toggle(event.target.checked)} />
        <span>隐藏 18+ 角色<span className="p-small">广场、发现页与搜索结果里不显示</span></span>
      </label>
      <p className="p-hint">默认展示，仅影响列表；直接打开角色链接仍然可见。你可以在 <a href="/guidelines">社区准则</a> 里了解内容边界。</p>
      {error && <p role="alert" className="p-form-error">{error}</p>}
    </section>
  );
}
