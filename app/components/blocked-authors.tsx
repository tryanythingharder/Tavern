'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function BlockedAuthors({ initial }: { initial: string[] }) {
  const [list, setList] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const unblock = async (author: string) => {
    setBusy(author);
    setError('');
    try {
      const result = await api<{ blocked: string[] }>('/api/me/blocked', { method: 'POST', body: JSON.stringify({ author, blocked: false }) });
      setList(result.blocked);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!list.length) {
    return <p className="p-small" style={{ margin: 0 }}>还没有屏蔽任何创作者。在作者页点「屏蔽创作者」后，这里会出现。</p>;
  }

  return (
    <div className="p-rows">
      {list.map((author) => (
        <div className="p-room-card" key={author} style={{ padding: '12px 16px' }}>
          <div className="p-room-main">
            <div className="p-room-title"><span>@{author}</span></div>
            <p className="p-room-last">屏蔽后不会在推荐、广场与作者页看到其作品。</p>
          </div>
          <button className="p-btn p-btn--sm" type="button" disabled={busy === author} onClick={() => void unblock(author)}>
            {busy === author ? '解除中…' : '解除屏蔽'}
          </button>
        </div>
      ))}
      {error && <p className="p-form-error" role="alert">{error}</p>}
    </div>
  );
}
