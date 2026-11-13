'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

type SessionInfo = { token: string; createdAt: number | null; expiresAt: number; userAgent: string | null; ip: string | null; current: boolean };

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return '未知设备';
  const ua = userAgent.toLowerCase();
  const platform = ua.includes('iphone') ? 'iPhone' : ua.includes('ipad') ? 'iPad' : ua.includes('android') ? 'Android'
    : ua.includes('mac os') ? 'Mac' : ua.includes('windows') ? 'Windows' : ua.includes('linux') ? 'Linux' : '设备';
  const browser = ua.includes('edg/') ? 'Edge' : ua.includes('chrome') ? 'Chrome' : ua.includes('safari') ? 'Safari'
    : ua.includes('firefox') ? 'Firefox' : '浏览器';
  return `${platform} · ${browser}`;
}

export function SessionsPanel({ initial }: { initial: SessionInfo[] }) {
  const [sessions, setSessions] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const revoke = async (token: string) => {
    setBusy(token);
    setError('');
    setNotice('');
    try {
      await api('/api/me/sessions', { method: 'POST', body: JSON.stringify({ token }) });
      setSessions((prev) => prev.filter((item) => item.token !== token));
      setNotice('已退出该设备。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy('others');
    setError('');
    setNotice('');
    try {
      const result = await api<{ removed: number }>('/api/me/sessions', { method: 'POST', body: JSON.stringify({ others: true }) });
      setSessions((prev) => prev.filter((item) => item.current));
      setNotice(`已退出 ${result.removed} 个其他设备。`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="p-rows">
        {sessions.map((session) => (
          <div className="p-room-card" key={session.token} style={{ padding: '12px 16px' }}>
            <div className="p-room-main">
              <div className="p-room-title">
                <span>{deviceLabel(session.userAgent)}</span>
                {session.current && <span className="p-pill p-pill--sm p-pill--ok">当前设备</span>}
              </div>
              <p className="p-room-last">
                {session.ip ? `${session.ip} · ` : ''}
                {session.createdAt ? `登录于 ${new Date(session.createdAt).toLocaleString('zh-CN')}` : '登录时间未知'}
                {' · '}有效至 {new Date(session.expiresAt).toLocaleDateString('zh-CN')}
              </p>
            </div>
            {!session.current && (
              <button className="p-btn p-btn--sm" type="button" disabled={busy === session.token} onClick={() => void revoke(session.token)}>
                {busy === session.token ? '退出中…' : '退出'}
              </button>
            )}
          </div>
        ))}
        {!sessions.length && <p className="p-small" style={{ margin: 0 }}>没有有效的登录设备。</p>}
      </div>
      {notice && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>{notice}</p>}
      {error && <p className="p-form-error" role="alert">{error}</p>}
      <button className="p-btn p-btn--sm" type="button" style={{ marginTop: 12 }} disabled={busy !== null || sessions.filter((item) => !item.current).length === 0} onClick={() => void revokeOthers()}>
        {busy === 'others' ? '退出中…' : '退出其他设备'}
      </button>
    </div>
  );
}
