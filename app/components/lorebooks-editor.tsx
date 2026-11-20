'use client';

import { useState } from 'react';
import { LORE_LOGICS, LORE_POSITIONS, type LoreEntry, type Lorebook } from '@/lib/resources';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';

const positionLabel = (key: string) => LORE_POSITIONS.find(([value]) => value === key)?.[1] ?? key;

function blankEntry(): LoreEntry {
  return {
    id: `entry-${Date.now()}`,
    title: '新条目',
    keywords: [],
    secondaryKeywords: [],
    logic: 'andAny',
    selective: false,
    text: '',
    enabled: true,
    constant: false,
    priority: 100,
    position: 'before',
    depth: 4,
    role: 'system',
    outletName: '',
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    probability: 100,
    excludeRecursion: false,
    preventRecursion: false,
  };
}

const STRATEGY_HINT: Record<string, string> = {
  evenly: '角色和全局世界书的条目混在一起，只按「顺序」排。',
  character_first: '先排角色附加的世界书和卡内世界书，再排全局世界书（ST 默认）。',
  global_first: '先排全局世界书，再排角色附加的世界书和卡内世界书。',
};

// ST「插入策略」：决定预算不够时谁先进上下文；聊天世界书、身份世界书总是排在最前。写进提示词的顺序仍只看条目的「顺序」
function LoreStrategyField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const save = async (next: string) => {
    const before = value;
    setValue(next);
    setError('');
    try {
      await api('/api/me/gen-prefs', { method: 'PATCH', body: JSON.stringify({ loreStrategy: next }) });
    } catch (caught) {
      setValue(before);
      setError((caught as Error).message);
    }
  };
  return (
    <div className="lb-strategy">
      <label htmlFor="lb-strategy">插入策略</label>
      <Select id="lb-strategy" className="p-input" value={value} onChange={(event) => void save(event.target.value)}>
        <option value="evenly">均匀排序</option>
        <option value="character_first">角色优先</option>
        <option value="global_first">全局优先</option>
      </Select>
      <span className="hint">{STRATEGY_HINT[value]} 预算不够时排在前面的先进；聊天世界书和身份世界书永远最先。</span>
      <ErrorLine message={error} />
    </div>
  );
}

export function LorebooksEditor({ initial, initialGlobal = null, chatBound = [], initialStrategy = 'character_first' }: { initial: Lorebook[]; initialGlobal?: number[] | null; chatBound?: number[]; initialStrategy?: string }) {
  const [books, setBooks] = useState<Lorebook[]>(initial);
  // 全局世界书（ST 的 Active World(s)）：null = 全部
  const [globalIds, setGlobalIds] = useState<number[] | null>(initialGlobal);
  // 「全部」不含聊天世界书
  const isGlobal = (id: number) => (globalIds === null ? !chatBound.includes(id) : globalIds.includes(id));
  const toggleGlobal = async (id: number, on: boolean) => {
    const base = globalIds === null ? books.map((book) => book.id).filter((item) => !chatBound.includes(item)) : globalIds;
    const next = on ? [...new Set([...base, id])] : base.filter((item) => item !== id);
    // 全部都勾上 = 回到「全部」（之后新建的书也自动全局）
    const value = books.every((book) => next.includes(book.id) || chatBound.includes(book.id)) && !next.some((item) => chatBound.includes(item)) ? null : next;
    const before = globalIds;
    setGlobalIds(value);
    try {
      await api('/api/lorebooks/global', { method: 'PUT', body: JSON.stringify({ ids: value }) });
    } catch (caught) {
      setGlobalIds(before);
      setError((caught as Error).message);
    }
  };
  const [draft, setDraft] = useState<Lorebook | null>(null);
  const [entryIndex, setEntryIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const create = async () => {
    setError('');
    try {
      const { lorebook } = await api<{ lorebook: Lorebook }>('/api/lorebooks', { method: 'POST', body: JSON.stringify({ name: '新的世界书', entries: [] }) });
      setBooks((prev) => [lorebook, ...prev]);
      setDraft({ ...lorebook });
      setEntryIndex(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const { lorebook } = await api<{ lorebook: Lorebook }>(`/api/lorebooks/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: draft.name, entries: draft.entries }),
      });
      setBooks((prev) => prev.map((item) => (item.id === lorebook.id ? lorebook : item)));
      setDraft(null);
      setEntryIndex(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/lorebooks/${id}`, { method: 'DELETE' });
      setBooks((prev) => prev.filter((item) => item.id !== id));
      setConfirmId(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const runImport = async () => {
    setImportError('');
    try {
      const { lorebook } = await api<{ lorebook: Lorebook }>('/api/lorebooks/import', { method: 'POST', body: JSON.stringify({ json: importText }) });
      setBooks((prev) => [lorebook, ...prev]);
      setImportOpen(false);
      setImportText('');
    } catch (caught) {
      setImportError((caught as Error).message);
    }
  };

  const updateEntry = (index: number, patch: Partial<LoreEntry>) => {
    if (!draft) return;
    setDraft({ ...draft, entries: draft.entries.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)) });
  };

  const entry = draft && entryIndex !== null ? draft.entries[entryIndex] : null;

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => void create()}>新建世界书</button>
        <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(true)}>导入 ST 世界书</button>
      </div>
      <LoreStrategyField initial={initialStrategy} />
      <ErrorLine message={error} />

      <div className="p-rows">
        {books.map((book) => (
          <div className="p-room-card" key={book.id}>
            <div className="p-room-main">
              <div className="p-room-title">{book.name}</div>
              <div className="p-room-last">
                {chatBound.includes(book.id) && <span className="lb-tag">聊天世界书 · </span>}
                {book.entries.length} 条条目 · {book.entries.filter((item) => item.enabled).length} 条启用 · {book.entries.filter((item) => item.constant).length} 条常驻
              </div>
            </div>
            <div className="p-library-actions">
              <label className="check lb-global" title="对所有聊天生效（ST：全局世界书）">
                <input type="checkbox" checked={isGlobal(book.id)} onChange={(event) => void toggleGlobal(book.id, event.target.checked)} />
                <span>全局</span>
              </label>
              {confirmId === book.id ? (
                <>
                  <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={() => void remove(book.id)}>确认删除</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => { setDraft({ ...book, entries: book.entries.map((item) => ({ ...item })) }); setEntryIndex(null); }}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(book.id)}>删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!books.length && <p className="small">还没有世界书。新建一本，或从 SillyTavern 导入。</p>}
      </div>

      {draft && (
        <Modal
          title={entry ? `条目 · ${entry.title || '未命名'}` : `编辑世界书 · ${draft.name}`}
          onClose={() => {
            if (entry) {
              setEntryIndex(null);
              return;
            }
            setDraft(null);
          }}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => { setDraft(null); setEntryIndex(null); }}>关闭</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存世界书'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          {entry && entryIndex !== null ? (
            <>
              <div className="p-field">
                <label>标题</label>
                <input className="p-input" value={entry.title} maxLength={80} onChange={(event) => updateEntry(entryIndex, { title: event.target.value })} />
              </div>
              <div className="p-field">
                <label>关键词（逗号分隔）</label>
                <input
                  className="p-input"
                  value={entry.keywords.join('，')}
                  placeholder="例如：报馆，申报，雨夜"
                  onChange={(event) => updateEntry(entryIndex, { keywords: event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) })}
                />
              </div>
              <label className="p-check" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={entry.constant} onChange={(event) => updateEntry(entryIndex, { constant: event.target.checked })} />
                <span>常驻（不需要关键词，每轮都进入上下文）</span>
              </label>
              <label className="p-check" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={entry.selective} onChange={(event) => updateEntry(entryIndex, { selective: event.target.checked })} />
                <span>需要次要关键词（ST 的 selective）</span>
              </label>
              {entry.selective && (
                <div className="p-field-row">
                  <div className="p-field">
                    <label>次要关键词</label>
                    <input
                      className="p-input"
                      value={entry.secondaryKeywords.join('，')}
                      onChange={(event) => updateEntry(entryIndex, { secondaryKeywords: event.target.value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean) })}
                    />
                  </div>
                  <div className="p-field">
                    <label>逻辑</label>
                    <Select className="p-select" value={entry.logic} onChange={(event) => updateEntry(entryIndex, { logic: event.target.value as LoreEntry['logic'] })}>
                      {LORE_LOGICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </Select>
                  </div>
                </div>
              )}
              <div className="p-field">
                <label>内容</label>
                <textarea className="p-textarea" rows={6} value={entry.text} onChange={(event) => updateEntry(entryIndex, { text: event.target.value })} />
              </div>
              <div className="p-field-row">
                <div className="p-field">
                  <label>插入位置</label>
                  <Select className="p-select" value={entry.position} onChange={(event) => updateEntry(entryIndex, { position: event.target.value as LoreEntry['position'] })}>
                    {LORE_POSITIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </Select>
                </div>
                {entry.position === 'depth' && (
                  <>
                    <div className="p-field">
                      <label>深度（倒数第 N 条之前）</label>
                      <input className="p-input" type="number" min={0} max={999} value={entry.depth} onChange={(event) => updateEntry(entryIndex, { depth: Number(event.target.value) })} />
                    </div>
                    <div className="p-field">
                      <label>身份</label>
                      <Select className="p-select" value={entry.role} onChange={(event) => updateEntry(entryIndex, { role: event.target.value as LoreEntry['role'] })}>
                        <option value="system">系统</option>
                        <option value="user">玩家</option>
                        <option value="assistant">角色</option>
                      </Select>
                    </div>
                  </>
                )}
                <div className="p-field">
                  <label>优先级（大的先进入）</label>
                  <input className="p-input" type="number" value={entry.priority} onChange={(event) => updateEntry(entryIndex, { priority: Number(event.target.value) })} />
                </div>
                <div className="p-field">
                  <label>触发概率 %</label>
                  <input className="p-input" type="number" min={0} max={100} value={entry.probability} onChange={(event) => updateEntry(entryIndex, { probability: Number(event.target.value) })} />
                </div>
              </div>
              <div className="p-field-row">
                <div className="p-field">
                  <label>大小写</label>
                  <Select
                    className="p-select"
                    value={entry.caseSensitive === null ? '' : entry.caseSensitive ? 'yes' : 'no'}
                    onChange={(event) => updateEntry(entryIndex, { caseSensitive: event.target.value === '' ? null : event.target.value === 'yes' })}
                  >
                    <option value="">跟随全局</option>
                    <option value="yes">区分</option>
                    <option value="no">不区分</option>
                  </Select>
                </div>
                <div className="p-field">
                  <label>整词匹配</label>
                  <Select
                    className="p-select"
                    value={entry.matchWholeWords === null ? '' : entry.matchWholeWords ? 'yes' : 'no'}
                    onChange={(event) => updateEntry(entryIndex, { matchWholeWords: event.target.value === '' ? null : event.target.value === 'yes' })}
                  >
                    <option value="">跟随全局</option>
                    <option value="yes">是</option>
                    <option value="no">否</option>
                  </Select>
                </div>
                <label className="p-check" style={{ alignSelf: 'end', marginBottom: 14 }}>
                  <input type="checkbox" checked={entry.enabled} onChange={(event) => updateEntry(entryIndex, { enabled: event.target.checked })} />
                  <span>启用</span>
                </label>
              </div>
              {/* ST 定时效果与包含组：按消息条数计 */}
              <div className="p-field-row">
                <div className="p-field">
                  <label>黏性（触发后保持 N 条）</label>
                  <input className="p-input" type="number" min={0} max={1000} value={entry.sticky ?? 0} onChange={(event) => updateEntry(entryIndex, { sticky: Number(event.target.value) || undefined })} />
                </div>
                <div className="p-field">
                  <label>冷却（之后 N 条不触发）</label>
                  <input className="p-input" type="number" min={0} max={1000} value={entry.cooldown ?? 0} onChange={(event) => updateEntry(entryIndex, { cooldown: Number(event.target.value) || undefined })} />
                </div>
                <div className="p-field">
                  <label>延迟（满 N 条才触发）</label>
                  <input className="p-input" type="number" min={0} max={1000} value={entry.delay ?? 0} onChange={(event) => updateEntry(entryIndex, { delay: Number(event.target.value) || undefined })} />
                </div>
              </div>
              <div className="p-field-row">
                <div className="p-field">
                  <label>包含组（同组只取一条，逗号分隔）</label>
                  <input className="p-input" value={entry.group ?? ''} maxLength={200} onChange={(event) => updateEntry(entryIndex, { group: event.target.value || undefined })} />
                </div>
                {entry.group ? (
                  <>
                    <div className="p-field">
                      <label>组内权重</label>
                      <input className="p-input" type="number" min={0} max={10000} value={entry.groupWeight ?? 100} onChange={(event) => updateEntry(entryIndex, { groupWeight: Number(event.target.value) })} />
                    </div>
                    <label className="p-check" style={{ alignSelf: 'end', marginBottom: 14 }}>
                      <input type="checkbox" checked={entry.groupOverride === true} onChange={(event) => updateEntry(entryIndex, { groupOverride: event.target.checked || undefined })} />
                      <span>组内优先</span>
                    </label>
                  </>
                ) : null}
              </div>
              <button
                className="p-btn p-btn--sm p-btn--danger"
                type="button"
                onClick={() => {
                  setDraft({ ...draft, entries: draft.entries.filter((_, at) => at !== entryIndex) });
                  setEntryIndex(null);
                }}
              >
                删除这条
              </button>
            </>
          ) : (
            <>
              <div className="p-field">
                <label>世界书名称</label>
                <input className="p-input" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </div>
              <div className="p-rows" style={{ marginBottom: 12 }}>
                {draft.entries.map((item, index) => (
                  <div className="p-room-card" key={item.id} style={{ padding: '10px 12px' }}>
                    <div className="p-room-main">
                      <div className="p-room-title" style={{ fontSize: 13.5 }}>{item.title || '未命名'}</div>
                      <div className="p-room-last">
                        {item.constant ? '常驻' : item.keywords.join('、') || '没有关键词'} · {positionLabel(item.position)}
                        {item.position === 'depth' ? ` · 深度 ${item.depth}` : ''} · {item.enabled ? '启用' : '停用'}
                      </div>
                    </div>
                    <button className="p-btn p-btn--sm" type="button" onClick={() => setEntryIndex(index)}>编辑</button>
                  </div>
                ))}
                {!draft.entries.length && <p className="small">还没有条目。关键词命中的条目才会进入上下文；「常驻」每轮都进入。</p>}
              </div>
              <button
                className="p-btn p-btn--sm"
                type="button"
                onClick={() => {
                  const next = blankEntry();
                  setDraft({ ...draft, entries: [...draft.entries, next] });
                  setEntryIndex(draft.entries.length);
                }}
              >
                添加条目
              </button>
            </>
          )}
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="导入 SillyTavern 世界书"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(false)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!importText.trim()} onClick={() => void runImport()}>导入</button>
            </>
          }
        >
          <ErrorLine message={importError} />
          <p className="small" style={{ marginTop: 0 }}>粘贴 ST 世界书 JSON（`entries` 对象或数组）。关键词、常驻、插入位置、深度、次要关键词逻辑、优先级都会映射过来。</p>
          <textarea className="p-textarea" rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"name":"上海旧事","entries":{"0":{"keys":["报馆"],"content":"…"}}}' />
        </Modal>
      )}
    </>
  );
}
