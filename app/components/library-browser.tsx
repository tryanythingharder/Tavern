'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterView } from '@/lib/characters';
import type { TagFolder, UserTag } from '@/lib/char-tags';
import { ProtoCover } from '@/components/proto-cover';
import { Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';
import { askConfirm, askPrompt, showAlert } from '@/components/ui-dialog';
import { usePlayMode } from '@/components/play-mode';

// 角色库（对齐 ST 的角色管理）：自己的标签（彩色、可当文件夹）、标签筛选（包含/排除）、收藏星标、
// 排序（最近聊天/添加/名称/聊天最多/随机）、批量选择打标签；导入/导出 ST 的 tags + tag_map。
// 新手模式只留搜索、排序、星标和已有标签的筛选，管理和批量收起来。

type Tab = 'all' | 'added' | 'works' | 'favorites';
type Sort = 'recent' | 'added' | 'name' | 'name-desc' | 'chats' | 'random';
type TagState = 'include' | 'exclude';
export type ChatStat = { latest: number; lastAt: number; chats: number; messages: number };

const STATUS_LABEL: Record<string, string> = { published: '已发布', draft: '草稿', archived: '已下架', pending: '审核中', rejected: '未通过' };
const STATUS_PILL: Record<string, string> = { published: 'p-pill--ok', draft: 'p-pill--outline', archived: 'p-pill--warn' };
const SWATCHES = ['', '#c9401f', '#b5651d', '#8c6a1f', '#4f7a2f', '#2f7a74', '#2f5f8a', '#6b4f8a', '#a03a5f', '#5c5c5c'];
const FOLDER_LABEL: Record<TagFolder, string> = { none: '普通标签', open: '文件夹（角色也留在主列表）', closed: '文件夹（只在文件夹里显示）' };
const STORE = 'tavern:library';

function readStore(): { sort?: Sort; tab?: Tab; tags?: Record<string, TagState> } {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

function tagStyle(tag: UserTag): React.CSSProperties | undefined {
  return tag.color ? { borderColor: tag.color, color: tag.color } : undefined;
}

export function LibraryBrowser({
  added,
  works,
  favorites,
  favoriteIds,
  addedAt,
  stats,
  chatted = [],
  initialTags,
  initialMap,
  userId,
}: {
  added: CharacterView[];
  works: CharacterView[];
  favorites: CharacterView[];
  favoriteIds: string[];
  addedAt: Record<string, number>;
  stats: Record<string, ChatStat>;
  chatted?: { id: string; name: string }[];
  initialTags: UserTag[];
  initialMap: Record<string, number[]>;
  userId: number;
}) {
  const router = useRouter();
  const mode = usePlayMode();
  const newbie = mode === 'newbie';

  const [addedSet, setAddedSet] = useState(() => new Set(added.map((c) => c.id)));
  const [favSet, setFavSet] = useState(() => new Set(favoriteIds));
  const [tags, setTags] = useState(initialTags);
  const [map, setMap] = useState(initialMap);
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [tagFilter, setTagFilter] = useState<Record<string, TagState>>({});
  const [folder, setFolder] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tagging, setTagging] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [seed, setSeed] = useState(1);
  const restored = useRef(false);

  // 记住排序、分类和标签筛选（ST 也会记住）
  useEffect(() => {
    const saved = readStore();
    if (saved.sort) setSort(saved.sort);
    if (saved.tab) setTab(saved.tab);
    if (saved.tags) setTagFilter(saved.tags);
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(STORE, JSON.stringify({ sort, tab, tags: tagFilter }));
    } catch {
      /* 隐私模式 */
    }
  }, [sort, tab, tagFilter]);

  const all = useMemo(() => {
    const seen = new Map<string, CharacterView>();
    for (const item of [...added, ...works, ...favorites]) if (!seen.has(item.id)) seen.set(item.id, item);
    return [...seen.values()];
  }, [added, works, favorites]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const tagsOf = (id: string) => (map[id] ?? []).map((tid) => tagById.get(tid)).filter((t): t is UserTag => Boolean(t)).sort((a, b) => a.sort - b.sort);

  const inTab = (item: CharacterView, key: Tab) =>
    key === 'all' ? true : key === 'added' ? addedSet.has(item.id) : key === 'works' ? item.ownerId === userId : favSet.has(item.id);
  const counts: Record<Tab, number> = {
    all: all.filter((c) => inTab(c, 'all')).length,
    added: all.filter((c) => inTab(c, 'added')).length,
    works: all.filter((c) => inTab(c, 'works')).length,
    favorites: all.filter((c) => inTab(c, 'favorites')).length,
  };
  const labels: Record<Tab, string> = { all: '全部', added: '已添加', works: '我创建的', favorites: '收藏' };

  const q = query.trim().toLowerCase();
  const activeTags = Object.entries(tagFilter).filter(([id]) => tagById.has(Number(id)));
  const filtering = Boolean(q) || activeTags.length > 0;
  const closedFolders = new Set(tags.filter((t) => t.folder === 'closed').map((t) => t.id));
  const folderTags = tags.filter((t) => t.folder !== 'none');

  const base = all.filter((item) => inTab(item, tab));
  const matched = base.filter((item) => {
    const own = map[item.id] ?? [];
    if (folder !== null && !own.includes(folder)) return false;
    for (const [id, state] of activeTags) {
      const has = own.includes(Number(id));
      if (state === 'include' && !has) return false;
      if (state === 'exclude' && has) return false;
    }
    // 根目录不搜不筛时，收起的文件夹里的角色不出现在主列表（ST Closed Folder）
    if (folder === null && !filtering && own.some((id) => closedFolders.has(id))) return false;
    if (!q) return true;
    const text = `${item.name} ${item.author} ${item.tags.join(' ')} ${tagsOf(item.id).map((t) => t.name).join(' ')}`.toLowerCase();
    return text.includes(q);
  });

  const rows = (() => {
    const list = [...matched];
    const name = (c: CharacterView) => c.name;
    const random = (id: string) => {
      let h = seed;
      for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return h;
    };
    const fav = (c: CharacterView) => (favSet.has(c.id) ? 1 : 0);
    list.sort((a, b) => {
      // 收藏置顶（ST 默认就是星标在前）
      if (sort !== 'random' && fav(a) !== fav(b)) return fav(b) - fav(a);
      switch (sort) {
        case 'name':
          return name(a).localeCompare(name(b), 'zh');
        case 'name-desc':
          return name(b).localeCompare(name(a), 'zh');
        case 'chats':
          return (stats[b.id]?.messages ?? 0) - (stats[a.id]?.messages ?? 0);
        case 'added':
          return (addedAt[b.id] ?? b.createdAt) - (addedAt[a.id] ?? a.createdAt);
        case 'random':
          return random(a.id) - random(b.id);
        default:
          return (stats[b.id]?.lastAt ?? 0) - (stats[a.id]?.lastAt ?? 0) || (addedAt[b.id] ?? b.createdAt) - (addedAt[a.id] ?? a.createdAt);
      }
    });
    return list;
  })();

  const folderRows = folder === null && !filtering
    ? folderTags.map((t) => ({ tag: t, count: base.filter((c) => (map[c.id] ?? []).includes(t.id)).length }))
    : [];
  const currentFolder = folder !== null ? tagById.get(folder) : undefined;

  const cycleTag = (id: number) => {
    setTagFilter((prev) => {
      const next = { ...prev };
      const now = next[id];
      if (!now) next[id] = 'include';
      else if (now === 'include') next[id] = 'exclude';
      else delete next[id];
      return next;
    });
  };

  const addChatted = async (id: string) => {
    setAdding(id);
    try {
      await fetch(`/api/characters/${id}/added`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ added: true }) });
      router.refresh();
    } finally {
      setAdding(null);
    }
  };

  const setFavorite = async (ids: string[], value: boolean) => {
    for (const id of ids) {
      await api(`/api/characters/${id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: value }) });
    }
    setFavSet((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const removeAdded = async (characterId: string) => {
    setBusyId(characterId);
    try {
      await api(`/api/characters/${characterId}/added`, { method: 'POST', body: JSON.stringify({ added: false }) });
      setAddedSet((prev) => {
        const next = new Set(prev);
        next.delete(characterId);
        return next;
      });
    } finally {
      setBusyId(null);
    }
  };

  const assign = async (ids: string[], add: number[], remove: number[]) => {
    const data = await api<{ map: Record<string, number[]> }>('/api/tags/assign', { method: 'POST', body: JSON.stringify({ characterIds: ids, add, remove }) });
    setMap(data.map);
  };
  const newTag = async (name?: string): Promise<UserTag | null> => {
    const text = name ?? (await askPrompt({ title: '新建标签', message: '标签名', placeholder: '例如：古风、长篇、已通关' }));
    if (!text?.trim()) return null;
    try {
      const data = await api<{ tag: UserTag }>('/api/tags', { method: 'POST', body: JSON.stringify({ name: text }) });
      setTags((prev) => (prev.some((t) => t.id === data.tag.id) ? prev : [...prev, data.tag]));
      return data.tag;
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : '新建失败');
      return null;
    }
  };

  const pickedIds = [...picked].filter((id) => rows.some((r) => r.id === id));
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkTag = async (value: string, remove: boolean) => {
    if (!value || !pickedIds.length) return;
    let id = Number(value);
    if (value === 'new') {
      const tag = await newTag();
      if (!tag) return;
      id = tag.id;
    }
    await assign(pickedIds, remove ? [] : [id], remove ? [id] : []);
  };
  const importFromCards = async (ids?: string[]) => {
    const data = await api<{ created: number; linked: number; tags: UserTag[]; map: Record<string, number[]> }>('/api/tags/import', {
      method: 'POST',
      body: JSON.stringify({ source: 'card', characterIds: ids }),
    });
    setTags(data.tags);
    setMap(data.map);
    await showAlert(`新建 ${data.created} 个标签，给 ${data.linked} 个角色打上了卡片自带的标签。`);
  };

  const sortLabel: Record<Sort, string> = { recent: '最近聊天', added: '最近添加', name: '名称 A→Z', 'name-desc': '名称 Z→A', chats: '聊得最多', random: '随机' };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>角色库</h1>
          <p>已添加的作品、你的创作和收藏，都在这里。</p>
        </div>
        <div className="p-page-title-actions">
          {!newbie && <button className="p-btn" type="button" onClick={() => setManaging(true)}>管理标签</button>}
          <Link className="p-btn" href="/create?tab=works">作品管理</Link>
          <Link className="p-btn p-btn--primary" href="/create">发布角色</Link>
        </div>
      </header>

      <div className="p-tabs p-library-tabs" role="tablist" aria-label="角色库分类">
        {(['all', 'added', 'works', 'favorites'] as Tab[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {labels[key]} {counts[key]}
          </button>
        ))}
      </div>

      <div className="p-filterbar">
        <div className="p-filterbar-main">
          <label className="p-search">
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input className="p-input" type="search" value={query} placeholder="搜索角色名、作者或标签" aria-label="搜索角色库" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <Select className="lib-sort" aria-label="排序" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            {(Object.keys(sortLabel) as Sort[]).map((key) => <option key={key} value={key}>{sortLabel[key]}</option>)}
          </Select>
          {sort === 'random' && <button className="p-btn p-btn--sm" type="button" onClick={() => setSeed((s) => s + 1)}>换一批</button>}
          {!newbie && (
            <button className="p-btn p-btn--sm" type="button" aria-pressed={bulk} onClick={() => { setBulk((b) => !b); setPicked(new Set()); }}>
              {bulk ? '完成' : '批量选择'}
            </button>
          )}
          <span className="p-filterbar-count">{rows.length} 个角色 · 库操作不会删除故事</span>
        </div>
        {(tags.length > 0 || !newbie) && (
          <div className="lib-tagbar" role="group" aria-label="按标签筛选">
            {tags.map((tag) => {
              const state = tagFilter[tag.id];
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`lib-tag lib-tag--filter${state ? ` is-${state}` : ''}`}
                  style={tagStyle(tag)}
                  aria-pressed={state ? 'true' : 'false'}
                  title={state === 'include' ? '只看带这个标签的（再点一下改为排除）' : state === 'exclude' ? '排除带这个标签的（再点一下取消）' : '点一下只看这个标签'}
                  onClick={() => cycleTag(tag.id)}
                >
                  {state === 'include' ? '✓ ' : state === 'exclude' ? '✕ ' : tag.folder !== 'none' ? '▸ ' : ''}
                  {tag.name}
                </button>
              );
            })}
            {activeTags.length > 0 && <button className="lib-tag lib-tag--clear" type="button" onClick={() => setTagFilter({})}>清除筛选</button>}
            {!tags.length && <span className="p-small">还没有标签。给角色打上自己的标签，就能筛选、归进文件夹。</span>}
          </div>
        )}
      </div>

      {bulk && (
        <div className="lib-bulkbar" role="toolbar" aria-label="批量操作">
          <span>已选 {pickedIds.length}</span>
          <button className="p-btn p-btn--sm" type="button" onClick={() => setPicked(pickedIds.length === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
            {pickedIds.length === rows.length && rows.length ? '全不选' : '全选'}
          </button>
          <Select aria-label="加标签" value="" disabled={!pickedIds.length} onChange={(event) => void bulkTag(event.target.value, false)}>
            <option value="">加标签…</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="new">＋ 新建标签</option>
          </Select>
          <Select aria-label="去掉标签" value="" disabled={!pickedIds.length || !tags.length} onChange={(event) => void bulkTag(event.target.value, true)}>
            <option value="">去掉标签…</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <button className="p-btn p-btn--sm" type="button" disabled={!pickedIds.length} onClick={() => void setFavorite(pickedIds, true)}>收藏</button>
          <button className="p-btn p-btn--sm" type="button" disabled={!pickedIds.length} onClick={() => void setFavorite(pickedIds, false)}>取消收藏</button>
          <button className="p-btn p-btn--sm" type="button" disabled={!pickedIds.length} onClick={() => void importFromCards(pickedIds)}>用卡片自带标签</button>
        </div>
      )}

      {currentFolder && (
        <nav className="lib-crumb" aria-label="文件夹">
          <button type="button" className="p-btn p-btn--sm" onClick={() => setFolder(null)}>← 角色库</button>
          <span className="lib-tag" style={tagStyle(currentFolder)}>▸ {currentFolder.name}</span>
        </nav>
      )}

      <div className="p-card p-rows">
        {folderRows.map(({ tag, count }) => (
          <button key={`f${tag.id}`} type="button" className="p-library-row lib-folder" onClick={() => setFolder(tag.id)}>
            <span className="lib-folder-icon" style={tag.color ? { color: tag.color } : undefined} aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.6l1.8 2h8.6A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /></svg>
            </span>
            <span className="p-library-main">
              <span className="p-library-name">{tag.name}</span>
              <span className="p-library-sub">{count} 个角色 · {tag.folder === 'closed' ? '只在文件夹里显示' : '也留在主列表'}</span>
            </span>
            <span className="p-small">打开 →</span>
          </button>
        ))}

        {rows.map((item) => {
          const latest = stats[item.id]?.latest;
          const own = tagsOf(item.id);
          const fav = favSet.has(item.id);
          const isWork = item.ownerId === userId;
          return (
            <div className={`p-library-row${bulk && picked.has(item.id) ? ' is-picked' : ''}`} key={item.id}>
              {bulk && (
                <input className="lib-check" type="checkbox" aria-label={`选择 ${item.name}`} checked={picked.has(item.id)} onChange={() => togglePick(item.id)} />
              )}
              <ProtoCover character={item} className="p-library-cover" />
              <div className="p-library-main">
                <div className="p-library-name">
                  <button
                    type="button"
                    className={`lib-star${fav ? ' is-on' : ''}`}
                    aria-pressed={fav}
                    aria-label={fav ? '取消收藏' : '收藏'}
                    title={fav ? '取消收藏' : '收藏'}
                    onClick={() => void setFavorite([item.id], !fav)}
                  >
                    {fav ? '★' : '☆'}
                  </button>
                  {item.name}
                  {item.nsfw && <span className="p-pill p-pill--sm" style={{ marginLeft: 6 }}>18+</span>}
                  {isWork && tab !== 'works' && <span className="p-pill p-pill--sm p-pill--outline" style={{ marginLeft: 6 }}>我的</span>}
                </div>
                <div className="p-library-sub">
                  {tab === 'works'
                    ? `${item.hook || '还没有写剧情钩子'} · ${item.category}`
                    : `@${item.author}${item.tags.length ? ` · ${item.tags.slice(0, 4).join(' · ')}` : ''}`}
                </div>
                {(own.length > 0 || !newbie) && (
                  <div className="lib-row-tags">
                    {own.map((tag) => (
                      <span key={tag.id} className="lib-tag lib-tag--sm" style={tagStyle(tag)}>{tag.name}</span>
                    ))}
                    {!newbie && (
                      <button type="button" className="lib-tag lib-tag--sm lib-tag--add" onClick={() => setTagging(item.id)} aria-label={`给 ${item.name} 打标签`}>
                        ＋ 标签
                      </button>
                    )}
                  </div>
                )}
                <div className="p-library-sub">
                  {latest ? `已有故事 · ${stats[item.id].chats} 个会话 · 继续不会新建会话` : '新故事会先选择开场与玩家身份'}
                </div>
              </div>
              <div className="p-library-actions">
                {isWork && (tab === 'works' || item.status !== 'published') && (
                  <span className={`p-pill p-pill--sm ${STATUS_PILL[item.status] ?? 'p-pill--outline'}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                )}
                <Link className="p-btn p-btn--sm" href={`/c/${item.id}`}>查看角色</Link>
                {latest && <Link className="p-btn p-btn--sm p-btn--primary" href={`/chats/${latest}`}>继续故事</Link>}
                <Link className="p-btn p-btn--sm" href={`/c/${item.id}`}>新故事</Link>
                {isWork && tab === 'works' && <Link className="p-btn p-btn--sm" href={`/create?edit=${item.id}`}>继续编辑</Link>}
                {tab === 'added' && (
                  <button className="p-btn p-btn--sm" type="button" disabled={busyId === item.id} onClick={() => void removeAdded(item.id)}>
                    {busyId === item.id ? '移除中…' : '移除已添加'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!rows.length && !folderRows.length && (
          <div className="p-empty">
            <div className="p-empty-title">
              {filtering ? '没有找到匹配的角色' : currentFolder ? '这个文件夹还是空的' : tab === 'works' ? '还没有自创角色' : tab === 'favorites' ? '还没有收藏' : '还没有添加角色'}
            </div>
            <p className="p-empty-text">
              {filtering ? '试试角色名、作者或标签，或清除标签筛选。' : currentFolder ? '给角色打上这个标签，它就会出现在这里。' : tab === 'works' ? '写一个，发布后会出现在广场。' : '添加或收藏喜欢的角色，就能随时回来；已有故事仍在对话页。'}
            </p>
            {!filtering && !currentFolder && (tab === 'added' || tab === 'all') && chatted.length > 0 && (
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
            {!filtering && !currentFolder && <Link className="p-btn p-btn--primary" href={tab === 'works' ? '/create' : '/plaza'}>{tab === 'works' ? '创建角色' : '去广场看看'}</Link>}
          </div>
        )}
      </div>

      {tagging && (
        <TagPicker
          name={all.find((c) => c.id === tagging)?.name ?? ''}
          cardTags={all.find((c) => c.id === tagging)?.tags ?? []}
          tags={tags}
          selected={map[tagging] ?? []}
          onToggle={(id, on) => void assign([tagging], on ? [id] : [], on ? [] : [id])}
          onCreate={async (name) => {
            const tag = await newTag(name);
            if (tag) await assign([tagging], [tag.id], []);
          }}
          onClose={() => setTagging(null)}
        />
      )}
      {managing && (
        <TagManager
          tags={tags}
          map={map}
          onChange={(next, nextMap) => {
            setTags(next);
            if (nextMap) setMap(nextMap);
          }}
          onFromCards={() => void importFromCards()}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  );
}

function TagPicker({
  name,
  cardTags,
  tags,
  selected,
  onToggle,
  onCreate,
  onClose,
}: {
  name: string;
  cardTags: string[];
  tags: UserTag[];
  selected: number[];
  onToggle: (id: number, on: boolean) => void;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const known = new Set(tags.map((t) => t.name));
  const suggestions = cardTags.filter((t) => t && !known.has(t)).slice(0, 8);
  const submit = async () => {
    if (!text.trim()) return;
    await onCreate(text.trim());
    setText('');
  };
  return (
    <Modal title={`给「${name}」打标签`} onClose={onClose} footer={<button className="btn btn--sm btn--primary" type="button" onClick={onClose}>完成</button>}>
      <div className="lib-picker">
        {tags.length > 0 ? (
          <div className="lib-picker-list">
            {tags.map((tag) => {
              const on = selected.includes(tag.id);
              return (
                <button key={tag.id} type="button" className={`lib-tag${on ? ' is-include' : ''}`} style={tagStyle(tag)} aria-pressed={on} onClick={() => onToggle(tag.id, !on)}>
                  {on ? '✓ ' : ''}
                  {tag.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="p-small">还没有标签，下面新建一个。</p>
        )}
        <form className="lib-picker-new" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <input className="p-input" value={text} maxLength={32} placeholder="新标签名，回车添加" aria-label="新标签名" onChange={(event) => setText(event.target.value)} />
          <button className="p-btn p-btn--sm" type="submit" disabled={!text.trim()}>添加</button>
        </form>
        {suggestions.length > 0 && (
          <div className="lib-picker-suggest">
            <span className="p-small">卡片自带：</span>
            {suggestions.map((t) => (
              <button key={t} type="button" className="lib-tag lib-tag--sm lib-tag--add" onClick={() => void onCreate(t)}>＋ {t}</button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TagManager({
  tags,
  map,
  onChange,
  onFromCards,
  onClose,
}: {
  tags: UserTag[];
  map: Record<string, number[]>;
  onChange: (tags: UserTag[], map?: Record<string, number[]>) => void;
  onFromCards: () => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const usage = (id: number) => Object.values(map).filter((ids) => ids.includes(id)).length;

  const patch = async (tag: UserTag, body: Partial<UserTag>) => {
    setError('');
    try {
      const data = await api<{ tag: UserTag }>(`/api/tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onChange(tags.map((t) => (t.id === tag.id ? data.tag : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  };
  const move = async (index: number, delta: number) => {
    const next = [...tags];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    const data = await api<{ tags: UserTag[] }>('/api/tags', { method: 'POST', body: JSON.stringify({ order: next.map((t) => t.id) }) });
    onChange(data.tags);
  };
  const remove = async (tag: UserTag) => {
    const n = usage(tag.id);
    const ok = await askConfirm({ message: `删除标签「${tag.name}」？${n ? `${n} 个角色会去掉这个标签，` : ''}角色本身不受影响。`, confirmLabel: '删除', danger: true });
    if (!ok) return;
    await api(`/api/tags/${tag.id}`, { method: 'DELETE' });
    const nextMap: Record<string, number[]> = {};
    for (const [cid, ids] of Object.entries(map)) nextMap[cid] = ids.filter((id) => id !== tag.id);
    onChange(tags.filter((t) => t.id !== tag.id), nextMap);
  };
  const create = async () => {
    const name = await askPrompt({ title: '新建标签', message: '标签名', placeholder: '例如：古风、长篇、已通关' });
    if (!name?.trim()) return;
    try {
      const data = await api<{ tag: UserTag }>('/api/tags', { method: 'POST', body: JSON.stringify({ name }) });
      if (!tags.some((t) => t.id === data.tag.id)) onChange([...tags, data.tag]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新建失败');
    }
  };
  const importSt = async (file: File) => {
    setError('');
    try {
      const data = JSON.parse(await file.text()) as Record<string, unknown>;
      // settings.json 里在顶层；有的备份包在 { tags, tag_map } 外再套一层
      const payload = Array.isArray(data.tags) ? data : (data.power_user as Record<string, unknown>) ?? data;
      const result = await api<{ created: number; linked: number; tags: UserTag[]; map: Record<string, number[]> }>('/api/tags/import', {
        method: 'POST',
        body: JSON.stringify({ source: 'st', data: { tags: payload.tags, tag_map: payload.tag_map } }),
      });
      onChange(result.tags, result.map);
      await showAlert(`导入 ${result.created} 个新标签，按角色名对上 ${result.linked} 个角色。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '文件读不了');
    }
  };

  return (
    <Modal
      title="管理标签"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--sm" type="button" onClick={create}>＋ 新建标签</button>
          <button className="btn btn--sm btn--primary" type="button" onClick={onClose}>完成</button>
        </>
      }
    >
      <div className="lib-manager">
        <p className="p-small">标签只有你自己看得到。设成文件夹后，角色库里会多一个文件夹入口；「只在文件夹里显示」的角色不会出现在主列表。</p>
        {error && <p className="p-error" role="alert">{error}</p>}
        {!tags.length && <p className="p-small">还没有标签。</p>}
        <ul className="lib-manager-list">
          {tags.map((tag, index) => (
            <li key={tag.id} className="lib-manager-row">
              <div className="lib-manager-order">
                <button type="button" className="icon-btn" aria-label="上移" disabled={index === 0} onClick={() => void move(index, -1)}>↑</button>
                <button type="button" className="icon-btn" aria-label="下移" disabled={index === tags.length - 1} onClick={() => void move(index, 1)}>↓</button>
              </div>
              <input
                className="p-input lib-manager-name"
                defaultValue={tag.name}
                maxLength={32}
                aria-label="标签名"
                onBlur={(event) => {
                  if (event.target.value.trim() && event.target.value.trim() !== tag.name) void patch(tag, { name: event.target.value });
                }}
              />
              <div className="lib-swatches" role="radiogroup" aria-label="颜色">
                {SWATCHES.map((color) => (
                  <button
                    key={color || 'none'}
                    type="button"
                    role="radio"
                    aria-checked={tag.color === color}
                    aria-label={color || '无颜色'}
                    className={`lib-swatch${tag.color === color ? ' is-on' : ''}${color ? '' : ' is-none'}`}
                    style={color ? { background: color } : undefined}
                    onClick={() => void patch(tag, { color })}
                  />
                ))}
              </div>
              <Select aria-label="类型" value={tag.folder} onChange={(event) => void patch(tag, { folder: event.target.value as TagFolder })}>
                {(Object.keys(FOLDER_LABEL) as TagFolder[]).map((key) => <option key={key} value={key}>{FOLDER_LABEL[key]}</option>)}
              </Select>
              <span className="p-small lib-manager-count">{usage(tag.id)} 个角色</span>
              <button type="button" className="p-btn p-btn--sm" onClick={() => void remove(tag)}>删除</button>
            </li>
          ))}
        </ul>
        <div className="lib-manager-io">
          <button type="button" className="p-btn p-btn--sm" onClick={onFromCards}>用卡片自带标签生成</button>
          <button type="button" className="p-btn p-btn--sm" onClick={() => fileRef.current?.click()}>导入 ST 标签</button>
          <a className="p-btn p-btn--sm" href="/api/tags?format=st" download="tags.json">导出 ST 标签</a>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importSt(file);
              event.target.value = '';
            }}
          />
        </div>
        <p className="p-small">导入 ST 标签：选 SillyTavern 的 settings.json（或标签备份），按角色名对上你库里的角色。</p>
      </div>
    </Modal>
  );
}
