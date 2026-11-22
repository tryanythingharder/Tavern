'use client';

import { LocalTime } from '@/components/local-time';
import { useState } from 'react';
import { ReportButton } from '@/components/report-button';
import { ErrorLine, api } from '@/components/settings-ui';

type Comment = { id: number; userId: number; nickname: string; content: string; createdAt: number };

export function CharacterComments({
  characterId,
  initial,
  currentUserId,
  isAdmin,
}: {
  characterId: string;
  initial: Comment[];
  currentUserId: number | null;
  isAdmin: boolean;
}) {
  const [comments, setComments] = useState(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(10);

  const post = async () => {
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setError('');
    try {
      const { comment } = await api<{ comment: Comment }>(`/api/characters/${characterId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setComments((prev) => [comment, ...prev]);
      setText('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/comments/${id}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((item) => item.id !== id));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <div>
      <ErrorLine message={error} />
      {currentUserId ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="input"
            value={text}
            maxLength={500}
            placeholder="说说你的感受…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void post();
              }
            }}
          />
          <button className="btn btn--sm btn--primary" type="button" disabled={busy || !text.trim()} onClick={() => void post()}>
            {busy ? '发送中…' : '发布'}
          </button>
        </div>
      ) : (
        <p className="small">登录后可以评论。</p>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {comments.slice(0, visible).map((comment) => (
          <div key={comment.id} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 650, fontSize: 13 }}>{comment.nickname}</span>
              <span className="small" style={{ fontSize: 11 }}><LocalTime value={comment.createdAt} style="mdhm" /></span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {(currentUserId === comment.userId || isAdmin) && (
                  <button className="msg-action" type="button" onClick={() => void remove(comment.id)}>删除</button>
                )}
                <ReportButton targetType="comment" targetId={comment.id} className="msg-action" />
              </div>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.7 }}>{comment.content}</p>
          </div>
        ))}
        {comments.length > visible && (
          <button className="btn btn--sm" type="button" onClick={() => setVisible((value) => value + 10)}>
            加载更多评论（{visible} / {comments.length}）
          </button>
        )}
        {!comments.length && <p className="small">还没有评论，来写第一条。</p>}
      </div>
    </div>
  );
}
