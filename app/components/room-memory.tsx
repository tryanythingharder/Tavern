'use client';

import { useCallback, useEffect, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';

// 群聊的作者注释与记忆摘要（ST：群聊同样按聊天保存 Author's Note / Summarize）。字段与单聊设置一致。

type Role = 'system' | 'user' | 'assistant';
type Note = { text: string; position: 'after' | 'before' | 'depth'; depth: number; role: Role; interval: number };
type Prefs = { enabled: boolean; interval: number; position: 'prompt' | 'depth' | 'none'; depth: number; role: Role; template: string; prompt: string; words: number };
type Data = { note: Note; prefs: Prefs; summary: { text: string; covered: number; source: 'auto' | 'manual'; error?: string }; behind: number; running: boolean; error?: string };

function RoleSelect({ value, onChange }: { value: Role; onChange: (value: Role) => void }) {
  return (
    <Select className="select" value={value} onChange={(event) => onChange(event.target.value as Role)}>
      <option value="system">系统</option>
      <option value="user">玩家</option>
      <option value="assistant">角色</option>
    </Select>
  );
}

export function RoomMemoryButton({ roomId, className = 'p-chat-icon' }: { roomId: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'note' | 'summary' | 'lore'>('note');
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const apply = (next: Data) => {
    setData(next);
    setNote(next.note);
    setPrefs(next.prefs);
    setSummaryText(next.summary.text);
    setError(next.error ?? next.summary.error ?? '');
  };

  const load = useCallback(async () => {
    setError('');
    try {
      apply(await api<Data>(`/api/rooms/${roomId}/memory`));
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取失败');
    }
  }, [roomId]);

  const save = async () => {
    if (!note || !prefs || !data) return;
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { note, prefs };
      if (summaryText !== data.summary.text) body.summaryText = summaryText;
      apply(await api<Data>(`/api/rooms/${roomId}/memory`, { method: 'PATCH', body: JSON.stringify(body) }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      apply(await api<Data>(`/api/rooms/${roomId}/memory`, { method: 'POST' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '摘要失败');
    } finally {
      setBusy(false);
    }
  };

  const setNoteField = <K extends keyof Note>(key: K, value: Note[K]) => setNote((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setPref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <>
      <button className={className} type="button" aria-label="作者注释与记忆" title="作者注释与记忆" onClick={() => { setOpen(true); void load(); }}>
        <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></svg>
      </button>
      {open && (
        <Modal
          title="群聊的注释与记忆"
          onClose={() => setOpen(false)}
          footer={
            <>
              {tab === 'summary' && <button className="btn btn--sm" type="button" disabled={busy || !data} onClick={() => void refresh()}>{busy ? '处理中…' : '立即更新摘要'}</button>}
              {tab !== 'lore' && <button className="btn btn--sm btn--primary" type="button" disabled={busy || !data} onClick={() => void save()}>{saved ? '已保存' : busy ? '保存中…' : '保存'}</button>}
            </>
          }
        >
          <div className="p-tabs" style={{ margin: '0 0 16px' }} role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'note'} onClick={() => setTab('note')}>作者注释</button>
            <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')}>记忆摘要</button>
            <button type="button" role="tab" aria-selected={tab === 'lore'} onClick={() => setTab('lore')}>世界书</button>
          </div>
          <ErrorLine message={error} />
          {tab === 'lore' ? <RoomLorePanel roomId={roomId} /> : !note || !prefs || !data ? (
            <p className="small" role="status">加载中…</p>
          ) : tab === 'note' ? (
            <>
              <p className="small" style={{ marginTop: 0, marginBottom: 14 }}>写给模型的场外提示，按位置和频率插进上下文，不显示在对话里。发言角色有自己的角色注释时，按那条注释的合并方式一起用。<small className="pm-st">Author&apos;s Note</small></p>
              <div className="field">
                <label>这个群聊的作者注释</label>
                <textarea className="textarea" rows={5} value={note.text} placeholder="例如：[本场目标：让大家在天亮前找到失踪的排字工；保持悬疑]" onChange={(event) => setNoteField('text', event.target.value)} />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>插入位置</label>
                  <Select className="select" value={note.position} onChange={(event) => setNoteField('position', event.target.value as Note['position'])}>
                    <option value="depth">聊天内 @深度</option>
                    <option value="after">主提示之后</option>
                    <option value="before">主提示之前</option>
                  </Select>
                </div>
                {note.position === 'depth' && (
                  <>
                    <div className="field">
                      <label>深度</label>
                      <input className="input" type="number" min={0} max={999} value={note.depth} onChange={(event) => setNoteField('depth', Number(event.target.value))} />
                    </div>
                    <div className="field">
                      <label>角色</label>
                      <RoleSelect value={note.role} onChange={(value) => setNoteField('role', value)} />
                    </div>
                  </>
                )}
                <div className="field">
                  <label>每几条消息插一次（0 = 不插）</label>
                  <input className="input" type="number" min={0} max={999} value={note.interval} onChange={(event) => setNoteField('interval', Number(event.target.value))} />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="small" style={{ marginTop: 0 }}>
                已覆盖 {data.summary.covered} 条 · 落后 {data.behind} 条{data.summary.source === 'manual' ? ' · 当前是手改版本' : ''}{data.running ? ' · 正在生成…' : ''}
                <small className="pm-st">Summarize</small>
              </p>
              <label className="check" style={{ marginBottom: 10 }}>
                <input type="checkbox" checked={prefs.enabled} onChange={(event) => setPref('enabled', event.target.checked)} />
                <span>启用自动摘要（用这个群聊的模型生成，扣点数）</span>
              </label>
              <div className="field-row">
                <div className="field">
                  <label>每多少条更新一次</label>
                  <input className="input" type="number" min={4} max={100} value={prefs.interval} onChange={(event) => setPref('interval', Number(event.target.value))} />
                </div>
                <div className="field">
                  <label>字数上限</label>
                  <input className="input" type="number" min={50} max={2000} step={50} value={prefs.words} onChange={(event) => setPref('words', Number(event.target.value))} />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>插入位置</label>
                  <Select className="select" value={prefs.position} onChange={(event) => setPref('position', event.target.value as Prefs['position'])}>
                    <option value="prompt">系统提示里（角色设定之后）</option>
                    <option value="depth">聊天内 @深度</option>
                    <option value="none">不自动插入（只用 {'{{summary}}'} 宏）</option>
                  </Select>
                </div>
                {prefs.position === 'depth' && (
                  <>
                    <div className="field">
                      <label>深度</label>
                      <input className="input" type="number" min={0} max={999} value={prefs.depth} onChange={(event) => setPref('depth', Number(event.target.value))} />
                    </div>
                    <div className="field">
                      <label>角色</label>
                      <RoleSelect value={prefs.role} onChange={(value) => setPref('role', value)} />
                    </div>
                  </>
                )}
              </div>
              <details className="mm-adv">
                <summary>摘要提示词与插入模板</summary>
                <div className="field">
                  <label>摘要提示词（{'{{words}}'} = 字数上限）</label>
                  <textarea className="textarea" rows={4} value={prefs.prompt} onChange={(event) => setPref('prompt', event.target.value)} />
                </div>
                <div className="field">
                  <label>插入模板（{'{{summary}}'} = 摘要正文）</label>
                  <input className="input" value={prefs.template} onChange={(event) => setPref('template', event.target.value)} />
                </div>
              </details>
              <div className="field">
                <label>摘要文本（可手改，之后的自动摘要在它的基础上继续）</label>
                <textarea className="textarea" rows={6} value={summaryText} onChange={(event) => setSummaryText(event.target.value)} />
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

type BookSource = 'global' | 'chatPick' | 'character' | 'chat' | 'persona';
const SOURCE_LABEL: Record<BookSource, string> = { global: '全局', chatPick: '本聊天选的', character: '角色附加', chat: '群聊世界书', persona: '身份' };
type LoreData = { chatLorebookId: number | null; lorebooks: { id: number; name: string; count: number }[]; activeLorebooks: { id: number; name: string; sources: BookSource[] }[] };

// 群聊世界书（ST Chat Lore）：即时保存
function RoomLorePanel({ roomId }: { roomId: number }) {
  const [data, setData] = useState<LoreData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void api<LoreData>(`/api/rooms/${roomId}/lorebook`).then(setData).catch((err: Error) => setError(err.message));
  }, [roomId]);
  const put = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      setData(await api<LoreData>(`/api/rooms/${roomId}/lorebook`, { method: 'PUT', body: JSON.stringify(body) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <><ErrorLine message={error} /><p className="small" role="status">加载中…</p></>;
  return (
    <>
      <ErrorLine message={error} />
      <div className="field cs-books">
        <label htmlFor="room-chat-lore">群聊世界书 <small className="pm-st">Chat Lore</small></label>
        <div className="cs-book-row">
          <Select id="room-chat-lore" className="select" value={data.chatLorebookId ?? ''} disabled={busy} onChange={(event) => void put({ chatLorebookId: event.target.value ? Number(event.target.value) : null })}>
            <option value="">不绑定</option>
            {data.lorebooks.map((book) => <option key={book.id} value={book.id}>{book.name}（{book.count} 条）</option>)}
          </Select>
          {!data.chatLorebookId && <button type="button" className="p-btn p-btn--sm" disabled={busy} onClick={() => void put({ create: true })}>新建一本</button>}
          {!!data.chatLorebookId && <a className="p-btn p-btn--sm" href="/me/lorebooks">去编辑</a>}
        </div>
        <span className="hint">只属于这个群聊，总是参与扫描；分支会带上。成员的角色附加世界书在单聊设置里绑定。</span>
      </div>
      <div className="field cs-books">
        <label>本次生效 <small className="pm-st">Active</small></label>
        <div className="cs-active-books">
          {data.activeLorebooks.length
            ? data.activeLorebooks.map((book) => <span className="cs-book-chip" key={book.id}>{book.name}<small>{book.sources.map((source) => SOURCE_LABEL[source]).join(' · ')}</small></span>)
            : <span className="hint">没有世界书在用（成员卡内世界书另算）。</span>}
        </div>
      </div>
    </>
  );
}
