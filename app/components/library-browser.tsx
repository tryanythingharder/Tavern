'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterView } from '@/lib/characters';
import { ProtoCover } from '@/components/proto-cover';
import { api } from '@/components/settings-ui';

type Tab = 'added' | 'works' | 'favorites';

const STATUS_LABEL: Record<string, string> = { published: '已发布', draft: '草稿', archived: '已下架' };
const STATUS_PILL: Record<string, string> = { published: 'p-pill--ok', draft: 'p-pill--outline', archived: 'p-pill--warn' };

export function LibraryBrowser({
  added,
  works,
  favorites,
  latestChats,
  chatted = [],
}: {
  added: CharacterView[];
  works: CharacterView[];
  favorites: CharacterView[];
  latestChats: Record<string, number>;
  chatted?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<string | null>(null);
  const addChatted = async (id: string) => {
    setAdding(id);
    try {
      await fetch(`/api/characters/${id}/added`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ added: true }) });
      router.refresh();
    } finally {
      setAdding(null);
    }
  };
  const [tab, setTab] = useState<Tab>('added');
  const [addedList, setAddedList] = useState(added);
  const [favoriteList, setFavoriteList] = useState(favorites);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const lists: Record<Tab, CharacterView[]> = { added: addedList, works, favorites: favoriteList };
  const labels: Record<Tab, string> = { added: '已添加', works: '我创建的', favorites: '收藏' };

  const q = query.trim().toLowerCase();
  const rows = lists[tab].filter((item) => {
    if (!q) return true;
    return `${item.name} ${item.author} ${item.tags.join(' ')}`.toLowerCase().includes(q);
  });

  const remove = async (kind: 'added' | 'favorite', characterId: string) => {
    setBusyId(characterId);
    try {
      if (kind === 'added') {
        await api(`/api/characters/${characterId}/added`, { method: 'POST', body: JSON.stringify({ added: false }) });
        setAddedList((prev) => prev.filter((item) => item.id !== characterId));
      } else {
        await api(`/api/characters/${characterId}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: false }) });
        setFavoriteList((prev) => prev.filter((item) => item.id !== characterId));
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>角色库</h1>
          <p>已添加的作品、你的创作和收藏，都在这里。</p>
        </div>
        <div className="p-page-title-actions">
          <Link className="p-btn" href="/create?tab=works">作品管理</Link>
          <Link className="p-btn p-btn--primary" href="/create">发布角色</Link>
        </div>
      </header>

      <div className="p-tabs p-library-tabs" role="tablist" aria-label="角色库分类">
        {(['added', 'works', 'favorites'] as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {labels[key]} {lists[key].length}
          </button>
        ))}
      </div>

      <div className="p-filterbar">
        <div className="p-filterbar-main">
          <label className="p-search">
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input className="p-input" type="search" value={query} placeholder="搜索角色名、作者或标签" aria-label="搜索角色库" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span className="p-filterbar-count">{rows.length} 个角色 · 库操作不会删除故事</span>
        </div>
      </div>

      <div className="p-card p-rows">
        {rows.map((item) => {
          const latest = latestChats[item.id];
          return (
            <div className="p-library-row" key={item.id}>
              <ProtoCover character={item} className="p-library-cover" />
              <div className="p-library-main">
                <div className="p-library-name">
                  {item.name}
                  {item.nsfw && <span className="p-pill p-pill--sm" style={{ marginLeft: 6 }}>18+</span>}
                </div>
                <div className="p-library-sub">
                  {tab === 'works'
                    ? `${item.hook || '还没有写剧情钩子'} · ${item.category}`
                    : `@${item.author}${item.tags.length ? ` · ${item.tags.join(' · ')}` : ''}`}
                </div>
                <div className="p-library-sub">
                  {latest ? '已有故事 · 继续不会新建会话' : '新故事会先选择开场与玩家身份'}
                </div>
              </div>
              <div className="p-library-actions">
                {tab === 'works' && (
                  <span className={`p-pill p-pill--sm ${STATUS_PILL[item.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                )}
                <Link className="p-btn p-btn--sm" href={`/c/${item.id}`}>查看角色</Link>
                {latest && <Link className="p-btn p-btn--sm p-btn--primary" href={`/chats/${latest}`}>继续故事</Link>}
                <Link className="p-btn p-btn--sm" href={`/c/${item.id}`}>新故事</Link>
                {tab === 'works' && <Link className="p-btn p-btn--sm" href={`/create?edit=${item.id}`}>继续编辑</Link>}
                {tab === 'added' && (
                  <button className="p-btn p-btn--sm" type="button" disabled={busyId === item.id} onClick={() => void remove('added', item.id)}>
                    {busyId === item.id ? '移除中…' : '移除已添加'}
                  </button>
                )}
                {tab === 'favorites' && (
                  <button className="p-btn p-btn--sm" type="button" disabled={busyId === item.id} onClick={() => void remove('favorite', item.id)}>
                    {busyId === item.id ? '取消中…' : '取消收藏'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!rows.length && (
          <div className="p-empty">
            <div className="p-empty-title">{q ? '没有找到匹配的角色' : tab === 'added' ? '还没有添加角色' : tab === 'works' ? '还没有自创角色' : '还没有收藏'}</div>
            <p className="p-empty-text">
              {q ? '试试角色名、作者或标签。' : tab === 'works' ? '写一个，发布后会出现在广场。' : '添加或收藏喜欢的角色，就能随时回来；已有故事仍在对话页。'}
            </p>
            {!q && tab === 'added' && chatted.length > 0 && (
              <div className="lib-chatted">
                <span className="p-small">最近聊过，可以直接加入：</span>
                <div className="lib-chatted-row">
                  {chatted.map((item) => (
                    <button key={item.id} type="button" className="p-btn p-btn--sm" disabled={adding === item.id} onClick={() => void addChatted(item.id)}>
                      ＋ {item.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Link className="p-btn p-btn--primary" href={tab === 'works' ? '/create' : '/plaza'}>{tab === 'works' ? '创建角色' : '去广场看看'}</Link>
          </div>
        )}
      </div>
    </>
  );
}
