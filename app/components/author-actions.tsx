'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ReportButton } from '@/components/report-button';
import { api } from '@/components/settings-ui';

export function AuthorActions({ author, initialBlocked }: { author: string; initialBlocked: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ blocked: string[] }>('/api/me/blocked', {
        method: 'POST',
        body: JSON.stringify({ author, blocked: !blocked }),
      });
      setBlocked(result.blocked.includes(author));
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="p-btn p-btn--sm" type="button" aria-pressed={blocked} disabled={busy} onClick={() => void toggle()}>
        {blocked ? '已屏蔽 · 解除' : '屏蔽创作者'}
      </button>
      <ReportButton targetType="user" targetId={author} label="举报创作者" className="p-btn p-btn--sm" />
      {error && <span className="p-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
