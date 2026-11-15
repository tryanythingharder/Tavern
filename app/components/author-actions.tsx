'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ReportButton } from '@/components/report-button';
import { api } from '@/components/settings-ui';

export function AuthorActions({ author, initialBlocked, initialFollowing = false, initialFollowers = 0, signedIn = true }: { author: string; initialBlocked: boolean; initialFollowing?: boolean; initialFollowers?: number; signedIn?: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
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

  const toggleFollow = async () => {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/a/${author}`)}`); return; }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ following: boolean; followers: number }>('/api/me/follows', {
        method: 'POST',
        body: JSON.stringify({ author, follow: !following }),
      });
      setFollowing(result.following);
      setFollowers(result.followers);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className={`p-btn p-btn--sm${following ? '' : ' p-btn--primary'}`} type="button" aria-pressed={following} disabled={busy || blocked} onClick={() => void toggleFollow()} title={following ? '取消关注' : '有新作品时通知我'}>
        {following ? '已关注' : '＋ 关注'}{followers > 0 && <span className="p-follow-n"> · {followers}</span>}
      </button>
      <button className="p-btn p-btn--sm" type="button" aria-pressed={blocked} disabled={busy} onClick={() => void toggle()}>
        {blocked ? '已屏蔽 · 解除' : '屏蔽创作者'}
      </button>
      <ReportButton targetType="user" targetId={author} label="举报创作者" className="p-btn p-btn--sm" />
      {error && <span className="p-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
