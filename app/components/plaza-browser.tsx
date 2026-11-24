'use client';

import { FileDrop } from '@/components/file-drop';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { ProtoWorkCard, type WorkCharacter } from '@/components/proto-work-card';
import { AgeGateDialog, type NsfwStateName } from '@/components/age-gate-dialog';
import { Select } from '@/components/ui-select';
import { ALL, CATEGORIES, HOT_TAG_COUNT, hasAllTags, hotTags, isCategory } from '@/lib/catalog';

type Item = WorkCharacter & { tags: string[]; nsfw: boolean; createdAt: number };

function heat(value: string): number {
  const number = Number(String(value).replace(/[^\d.]/g, '')) || 0;
  return String(value).includes('万') ? number * 10000 : number;
}

export function PlazaBrowser({ characters, initialHideNsfw, initialBlocked, nsfwState = 'allowed', minAge = 18, initialCategory, initialTags = [] }: { characters: Item[]; initialHideNsfw: boolean; initialBlocked: string[]; nsfwState?: NsfwStateName; minAge?: number; initialCategory?: string; initialTags?: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'hot' | 'new'>('hot');
  const [category, setCategory] = useState<string>(isCategory(initialCategory) ? initialCategory : ALL);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [hideNsfw, setHideNsfw] = useState(initialHideNsfw);
  const [visible, setVisible] = useState(6);
  const [blocked, setBlocked] = useState<string[]>(initialBlocked);
  const [ageOpen, setAgeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [busy, setBusy] = useState(false);

  // 当前可见（未被 18+ / 屏蔽作者过滤掉）的卡片：大类计数和热门标签都从这里统计
  const pool = useMemo(
    () => characters.filter((character) => !(hideNsfw && character.nsfw) && !blocked.includes(character.author)),
    [characters, hideNsfw, blocked],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const character of pool) counts.set(character.category, (counts.get(character.category) ?? 0) + 1);
    return counts;
  }, [pool]);
  // 热门标签按当前大类统计，取前 N 个；已选的标签即使掉出前 N 也保留显示，方便取消
  const tagChips = useMemo(() => {
    const scope = category === ALL ? pool : pool.filter((character) => character.category === category);
    const top = hotTags(scope, HOT_TAG_COUNT).map((item) => item.tag);
    return [...tags.filter((item) => !top.includes(item)), ...top];
  }, [pool, category, tags]);

  const syncUrl = (nextCategory: string, nextTags: string[]) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.delete('category');
    params.delete('tag');
    if (nextCategory !== ALL) params.set('category', nextCategory);
    for (const item of nextTags) params.append('tag', item);
    const suffix = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`);
  };
  const pickCategory = (next: string) => { setCategory(next); setVisible(6); syncUrl(next, tags); };
  const toggleTag = (item: string) => {
    const next = tags.includes(item) ? tags.filter((value) => value !== item) : [...tags, item];
    setTags(next);
    setVisible(6);
    syncUrl(category, next);
  };
  const clearFilters = () => { setQuery(''); setCategory(ALL); setTags([]); setVisible(6); syncUrl(ALL, []); };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = pool.filter((character) => {
      if (category !== ALL && character.category !== category) return false;
      if (!hasAllTags(character, tags)) return false;
      if (!q) return true;
      return `${character.name} ${character.author} ${character.hook} ${character.tags.join(' ')}`.toLowerCase().includes(q);
    });
    return matched.sort((a, b) => (sort === 'new' ? b.createdAt - a.createdAt : heat(b.chats) - heat(a.chats)));
  }, [pool, query, category, tags, sort]);

  const shown = list.slice(0, visible);

  const setNsfwPref = async (next: boolean) => {
    setHideNsfw(next);
    try {
      await api('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ hideNsfw: next }) });
    } catch {
      // 偏好保存失败时以本次浏览为准
    }
  };

  const toggleNsfw = () => {
    if (!hideNsfw) {
      void setNsfwPref(true);
      return;
    }
    // 已确认过年龄：直接打开；否则走年龄流程（填出生日期 / 验证 / 说明）
    if (nsfwState === 'allowed') {
      void setNsfwPref(false);
      return;
    }
    setAgeOpen(true);
  };

  const unblockAll = async () => {
    const previous = blocked;
    setBlocked([]);
    try {
      for (const author of previous) await api('/api/me/blocked', { method: 'POST', body: JSON.stringify({ author, blocked: false }) });
    } catch {
      // 忽略
    }
  };

  const importPng = async (file: File) => {
    setBusy(true);
    setImportError('');
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('图片太大（上限 20MB）');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
      });
      const { character } = await api<{ character: { id: string } }>('/api/characters/import', { method: 'POST', body: JSON.stringify({ png: base64 }) });
      router.push(`/c/${character.id}`);
    } catch (caught) {
      setImportError((caught as Error).message);
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setImportError('');
    try {
      const { character } = await api<{ character: { id: string } }>('/api/characters/import', { method: 'POST', body: JSON.stringify({ json: importText }) });
      router.push(`/c/${character.id}`);
    } catch (caught) {
      setImportError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>广场</h1>
          <p>找到值得一起走下去的角色。</p>
        </div>
        <div className="p-page-title-actions">
          <button className="p-btn" type="button" onClick={() => { setImportOpen(true); setImportText(''); setImportError(''); }}>导入角色卡</button>
          <Link className="p-btn p-btn--primary" href="/create">发布角色</Link>
        </div>
      </header>

      <div className="p-filterbar">
        <div className="p-filterbar-main">
          <label className="p-search">
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input
              className="p-input"
              type="search"
              value={query}
              placeholder="筛选广场中的角色、作者或剧情"
              aria-label="筛选广场角色"
              onChange={(event) => { setQuery(event.target.value); setVisible(6); }}
            />
          </label>
          <Select className="p-select" aria-label="排序方式" value={sort} onChange={(event) => setSort(event.target.value as 'hot' | 'new')}>
            <option value="hot">最热</option>
            <option value="new">最新</option>
          </Select>
          {/* 全站关闭 / 地区不提供 / 未满年龄时不放这个开关 */}
          {!['site_off', 'region_blocked', 'underage'].includes(nsfwState) && (
            <button className="p-chip" type="button" aria-pressed={!hideNsfw} onClick={toggleNsfw}>
              {hideNsfw ? '显示 18+' : '已显示 18+'}
            </button>
          )}
          <span className="p-filterbar-count">{list.length} 个作品</span>
        </div>
        <div className="p-chips plaza-categories" role="group" aria-label="角色题材">
          {[ALL, ...CATEGORIES].map((item) => {
            const count = item === ALL ? pool.length : categoryCounts.get(item) ?? 0;
            return (
              <button key={item} className="p-chip" type="button" aria-pressed={category === item} disabled={!count && category !== item} onClick={() => pickCategory(item)}>
                {item}
                <span className="plaza-chip-count">{count}</span>
              </button>
            );
          })}
          {blocked.length > 0 && (
            <button className="p-chip" type="button" onClick={() => void unblockAll()}>已屏蔽 {blocked.length} 位作者 · 解除</button>
          )}
        </div>
        {tagChips.length > 0 && (
          <div className="p-chips plaza-tags" role="group" aria-label="热门标签">
            <span className="plaza-tags-label">热门标签</span>
            {tagChips.map((item) => (
              <button key={item} className="p-chip p-chip--sm" type="button" aria-pressed={tags.includes(item)} onClick={() => toggleTag(item)}>#{item}</button>
            ))}
            {tags.length > 0 && <button className="p-text-btn" type="button" onClick={() => { setTags([]); setVisible(6); syncUrl(category, []); }}>清除标签</button>}
          </div>
        )}
        {query.trim() && (
          <p className="p-small" style={{ margin: '8px 0 0' }}>
            <Link className="p-text-btn" href={`/search?q=${encodeURIComponent(query.trim())}`}>在全部角色和作者中搜索「{query.trim()}」→</Link>
          </p>
        )}
      </div>

      <div className="p-work-grid">
        {shown.map((character) => (
          <ProtoWorkCard key={character.id} character={character} />
        ))}
        {!list.length && (
          <div className="p-empty" style={{ gridColumn: '1/-1' }}>
            <div className="p-empty-title">没有找到匹配的角色</div>
            <p className="p-empty-text">试试角色名、作者或「雨夜」「慢热」等关键词。</p>
            <button className="p-btn" type="button" onClick={() => { clearFilters(); void unblockAll(); }}>清除筛选</button>
          </div>
        )}
      </div>

      <div className="p-loadmore">
        <span>{list.length ? `已显示 ${Math.min(visible, list.length)} / ${list.length}` : '没有结果'}</span>
        {visible < list.length && <button className="p-btn" type="button" onClick={() => setVisible((value) => value + 6)}>加载更多</button>}
      </div>

      {ageOpen && (
        <AgeGateDialog
          state={nsfwState}
          minAge={minAge}
          onClose={() => setAgeOpen(false)}
          onAllowed={() => { setAgeOpen(false); setHideNsfw(false); router.refresh(); }}
        />
      )}

      {importOpen && (
        <Modal
          title="导入角色卡"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button className="btn btn--sm" type="button" onClick={() => setImportOpen(false)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={busy || !importText.trim()} onClick={() => void runImport()}>{busy ? '导入中…' : '导入'}</button>
            </>
          }
        >
          <ErrorLine message={importError} />
          <div className="field">
            <label>角色卡 PNG</label>
            <FileDrop accept="image/png" disabled={busy} title="选择 PNG 角色卡" hint="点击选择，或把 SillyTavern / Chub 导出的 PNG 拖到这里" onFile={(file) => void importPng(file)} />
            <span className="hint">{busy ? '正在读取 PNG 里的角色卡…' : '读取 PNG 中 chara / ccv3 数据，卡面会同时存成角色封面。'}</span>
          </div>
          <div className="field">
            <label>或者粘贴 JSON</label>
            <textarea className="textarea" rows={7} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"spec":"chara_card_v2","data":{"name":"…","description":"…","first_mes":"…"}}' />
          </div>
        </Modal>
      )}
    </>
  );
}
