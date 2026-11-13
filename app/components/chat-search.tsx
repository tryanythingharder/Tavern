'use client';

import { useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type Hit = { id: number; role: string; content: string; bookmark: number; created_at: number };

function snippet(content: string, query: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (!query) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const start = Math.max(0, at - 40);
  const end = Math.min(text.length, at + query.length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function ChatSearch({ chatId, characterName }: { chatId: number; characterName: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [bookmarksOnly, setBookmarksOnly] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (nextQuery = query, nextBookmarks = bookmarksOnly) => {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({ q: nextQuery });
      if (nextBookmarks) params.set('bookmarks', '1');
      const result = await api<{ hits: Hit[] }>(`/api/chats/${chatId}/search?${params.toString()}`);
      setHits(result.hits);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const jump = (id: number) => {
    setOpen(false);
    setTimeout(() => {
      const element = document.getElementById(`msg-${id}`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.classList.add('msg--flash');
      window.setTimeout(() => element.classList.remove('msg--flash'), 1600);
    }, 140);
  };

  return (
    <>
      <button className="btn btn--sm" type="button" onClick={() => setOpen(true)}>搜索</button>
      {open && (
        <Modal title="搜索这段对话" onClose={() => setOpen(false)}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              autoFocus
              value={query}
              placeholder="搜台词、动作或关键词"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void run();
              }}
            />
            <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void run()}>搜索</button>
          </div>
          <label className="check" style={{ marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={bookmarksOnly}
              onChange={(event) => {
                setBookmarksOnly(event.target.checked);
                void run(query, event.target.checked);
              }}
            />
            <span>只看书签</span>
          </label>
          <ErrorLine message={error} />

          {hits === null ? (
            <p className="small">{bookmarksOnly ? '加载书签…' : '输入关键词后回车，或直接点「只看书签」列出全部书签。'}</p>
          ) : (
            <div className="res-list">
              {hits.map((hit) => (
                <button key={hit.id} type="button" className="res-row" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => jump(hit.id)}>
                  <div className="res-row-main">
                    <div className="res-row-title" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                      {hit.role === 'user' ? '你' : characterName}
                      {hit.bookmark === 1 ? ' · 书签' : ''}
                    </div>
                    <div className="res-row-sub" style={{ whiteSpace: 'normal', color: 'var(--text-2)', fontSize: 13 }}>
                      {snippet(hit.content, query)}
                    </div>
                  </div>
                </button>
              ))}
              {!hits.length && <p className="small">{bookmarksOnly ? '还没有书签。在消息的「⋯」里点「书签」就能标记。' : '没有找到匹配的消息。'}</p>}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
