'use client';

import { useState } from 'react';
import type { QuickReply } from '@/lib/resources';
import { ErrorLine, api } from '@/components/settings-ui';

export function QuickRepliesEditor({ initial }: { initial: QuickReply[] }) {
  const [replies, setReplies] = useState<QuickReply[]>(initial);
  const [label, setLabel] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const add = async () => {
    if (!label.trim() || !content.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { reply } = await api<{ reply: QuickReply }>('/api/quick-replies', { method: 'POST', body: JSON.stringify({ label, content }) });
      setReplies((prev) => [...prev, reply]);
      setLabel('');
      setContent('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/quick-replies/${id}`, { method: 'DELETE' });
      setReplies((prev) => prev.filter((item) => item.id !== id));
      setConfirmId(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <>
      <ErrorLine message={error} />
      <div className="p-card p-card--pad" style={{ marginBottom: 16 }}>
        <h2 className="p-form-section-title">新增快捷回复</h2>
        <div className="p-field-row">
          <div className="p-field">
            <label>按钮文字</label>
            <input className="p-input" value={label} maxLength={30} placeholder="例如：推门进去" onChange={(event) => setLabel(event.target.value)} />
          </div>
          <div className="p-field" style={{ gridColumn: 'span 2' }}>
            <label>内容（会插入输入框）</label>
            <input className="p-input" value={content} placeholder="例如：*推开门，雨声涌进来*" onChange={(event) => setContent(event.target.value)} />
          </div>
        </div>
        <button className="btn btn--primary btn--sm" type="button" disabled={busy || !label.trim() || !content.trim()} onClick={() => void add()}>添加</button>
      </div>

      <div className="p-rows">
        {replies.map((reply) => (
          <div className="p-room-card" key={reply.id}>
            <div className="p-room-main">
              <div className="p-room-title">{reply.label}</div>
              <div className="p-room-last">{reply.content}</div>
            </div>
            <div className="p-library-actions">
              {confirmId === reply.id ? (
                <>
                  <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={() => void remove(reply.id)}>确认删除</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(reply.id)}>删除</button>
              )}
            </div>
          </div>
        ))}
        {!replies.length && <p className="small">还没有快捷回复。它们会显示在对话输入框上方，点一下就能填进去。</p>}
      </div>
    </>
  );
}
