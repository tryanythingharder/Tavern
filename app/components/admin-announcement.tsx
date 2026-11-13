'use client';

import { useState } from 'react';
import { api } from '@/components/settings-ui';

export function AdminAnnouncement({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const save = async (value: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ text: string }>('/api/admin/announcement', { method: 'PATCH', body: JSON.stringify({ text: value }) });
      setText(result.text);
      setNotice(result.text ? '公告已保存，玩家端顶部会显示。' : '公告已关闭。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-card p-card--pad">
      <h2 className="p-form-section-title">玩家端公告</h2>
      <p className="p-small">显示在顶栏下方的社区提醒条。留空并保存即关闭。玩家可以单独关闭，关闭后本地记住。</p>
      {error && <p className="p-form-error" role="alert">{error}</p>}
      {notice && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>{notice}</p>}
      <div className="p-field">
        <label className="p-label" htmlFor="announcement-text">公告内容</label>
        <textarea
          id="announcement-text"
          className="p-textarea"
          rows={4}
          maxLength={200}
          value={text}
          placeholder="例如：社区提醒：请尊重创作者的公开设定，不要在评论中披露他人的私有提示词。"
          onChange={(event) => setText(event.target.value)}
        />
        <span className="p-hint">最多 200 字；已关闭公告的用户需要清除浏览器本地记录才会再次看到。</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="p-btn p-btn--primary" type="button" disabled={busy || !text.trim()} onClick={() => void save(text)}>{busy ? '保存中…' : '保存公告'}</button>
        <button className="p-btn" type="button" disabled={busy || !text.trim()} onClick={() => void save('')}>关闭公告</button>
      </div>
    </section>
  );
}
