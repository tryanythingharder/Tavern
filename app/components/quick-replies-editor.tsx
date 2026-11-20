'use client';

import { useRef, useState } from 'react';
import { AUTO_LABELS, NO_AUTO, type QrItem, type QrSet, type QrState } from '@/lib/quick-replies';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { askConfirm } from '@/components/ui-dialog';

// 快捷回复（ST Quick Reply v2）：集 → 按钮。按钮内容可以是普通文字（发出去或填进输入框），也可以是斜杠命令（/ 开头，| 串联）。

type DraftItem = Omit<QrItem, 'id'> & { id?: number; key: string };
type DraftSet = Omit<QrSet, 'replies'> & { replies: DraftItem[] };

let keySeed = 0;
const newKey = () => `qr-${Date.now()}-${keySeed++}`;

function toDraft(set: QrSet): DraftSet {
  return { ...set, replies: set.replies.map((item) => ({ ...item, auto: { ...item.auto }, context: item.context.map((link) => ({ ...link })), key: newKey() })) };
}

function blankItem(index: number): DraftItem {
  return { key: newKey(), label: `按钮 ${index + 1}`, title: '', message: '', hidden: false, auto: { ...NO_AUTO }, preventAuto: true, context: [] };
}

export function QuickRepliesEditor({ initial }: { initial: QrState }) {
  const [state, setState] = useState<QrState>(initial);
  const [draft, setDraft] = useState<DraftSet | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const apply = (data: Partial<QrState>) => {
    if (data.sets && data.globalIds) setState({ sets: data.sets, globalIds: data.globalIds, scopeIds: [] });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const data = await api<QrState & { set: QrSet }>('/api/quick-replies', { method: 'POST', body: JSON.stringify({ action: 'create', name: '新快捷回复集' }) });
      apply(data);
      setDraft(toDraft(data.set));
      setOpen(null);
    });

  const importFiles = (files: FileList | null) =>
    run(async () => {
      if (!files?.length) return;
      const list: unknown[] = [];
      for (const file of [...files]) {
        try {
          const parsed = JSON.parse(await file.text());
          list.push(...(Array.isArray(parsed) ? parsed : [parsed]));
        } catch {
          throw new Error(`${file.name} 不是有效的 JSON`);
        }
      }
      const data = await api<QrState>('/api/quick-replies', { method: 'POST', body: JSON.stringify({ action: 'import', data: list }) });
      apply(data);
      if (fileRef.current) fileRef.current.value = '';
    });

  const toggleGlobal = (setId: number, on: boolean) =>
    run(async () => {
      const globalIds = on ? [...state.globalIds, setId] : state.globalIds.filter((id) => id !== setId);
      apply(await api<QrState>('/api/quick-replies', { method: 'PUT', body: JSON.stringify({ globalIds }) }));
    });

  const remove = async (set: QrSet) => {
    const ok = await askConfirm({ message: `删除快捷回复集「${set.name}」和里面的 ${set.replies.length} 个按钮？`, confirmLabel: '删除', danger: true });
    if (!ok) return;
    await run(async () => apply(await api<QrState>(`/api/quick-replies/sets/${set.id}`, { method: 'DELETE' })));
  };

  const save = () =>
    run(async () => {
      if (!draft) return;
      const { id, replies, ...rest } = draft;
      const data = await api<QrState & { set: QrSet }>(`/api/quick-replies/sets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...rest, replies: replies.map(({ key: _key, ...item }) => item) }),
      });
      apply(data);
      setDraft(null);
    });

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    if (!draft) return;
    setDraft({ ...draft, replies: draft.replies.map((item) => (item.key === key ? { ...item, ...patch } : item)) });
  };
  const moveItem = (key: string, delta: number) => {
    if (!draft) return;
    const list = [...draft.replies];
    const index = list.findIndex((item) => item.key === key);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setDraft({ ...draft, replies: list });
  };

  return (
    <>
      <div className="qr-toolbar">
        <button className="btn btn--primary btn--sm" type="button" disabled={busy} onClick={() => void create()}>新建快捷回复集</button>
        <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>导入 ST 快捷回复</button>
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
      </div>
      <ErrorLine message={error} />

      <div className="p-rows">
        {state.sets.map((set) => (
          <div className="p-room-card" key={set.id}>
            <div className="p-room-main">
              <div className="p-room-title">
                {set.color && <span className="qr-swatch" style={{ background: set.color }} aria-hidden="true" />}
                {set.name}
              </div>
              <div className="p-room-last">
                {set.replies.length} 个按钮
                {set.replies.some((item) => item.hidden) ? ` · ${set.replies.filter((item) => item.hidden).length} 个隐藏` : ''}
                {set.replies.some((item) => Object.values(item.auto).some(Boolean)) ? ' · 含自动执行' : ''}
                {set.disableSend ? ' · 填进输入框' : ''}
              </div>
            </div>
            <div className="p-library-actions">
              <label className="check lb-global" title="所有聊天都显示这个集（单个聊天也可以在聊天里的 ⚙ 单独开）">
                <input type="checkbox" checked={state.globalIds.includes(set.id)} disabled={busy} onChange={(event) => void toggleGlobal(set.id, event.target.checked)} />
                <span>全局</span>
              </label>
              <button className="p-btn p-btn--sm" type="button" onClick={() => { setDraft(toDraft(set)); setOpen(null); }}>编辑</button>
              <a className="p-btn p-btn--sm" href={`/api/quick-replies/sets/${set.id}?format=st`} download>导出</a>
              <button className="p-btn p-btn--sm" type="button" onClick={() => void remove(set)}>删除</button>
            </div>
          </div>
        ))}
        {!state.sets.length && <p className="small">还没有快捷回复。新建一个集，或导入 SillyTavern 导出的快捷回复集（.json）。</p>}
      </div>

      {draft && (
        <Modal
          title={`编辑快捷回复集 · ${draft.name || '未命名'}`}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft(null)}>关闭</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          <div className="p-field-row">
            <div className="p-field" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="qr-set-name">集名称</label>
              <input id="qr-set-name" className="p-input" value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </div>
            <div className="p-field">
              <label htmlFor="qr-set-color">按钮颜色</label>
              <div className="qr-color-row">
                {['', '#c9401f', '#8c6a1f', '#2f7a74', '#8c5e4a', '#5b6b2f', '#7a3e5a'].map((color) => (
                  <button
                    key={color || 'none'}
                    type="button"
                    className={`qr-color${draft.color === color ? ' is-on' : ''}`}
                    style={color ? { background: color } : undefined}
                    aria-label={color ? `颜色 ${color}` : '默认颜色'}
                    aria-pressed={draft.color === color}
                    onClick={() => setDraft({ ...draft, color })}
                  >
                    {color ? '' : '无'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="qr-flags">
            <label className="p-check"><input type="checkbox" checked={draft.disableSend} onChange={(event) => setDraft({ ...draft, disableSend: event.target.checked })} /> 不发送，填进输入框</label>
            <label className="p-check"><input type="checkbox" checked={draft.placeBeforeInput} onChange={(event) => setDraft({ ...draft, placeBeforeInput: event.target.checked })} /> 放在输入内容前面</label>
            <label className="p-check"><input type="checkbox" checked={draft.injectInput} onChange={(event) => setDraft({ ...draft, injectInput: event.target.checked })} /> 自动带上输入框的内容（不勾时用 {'{{input}}'}）</label>
            {draft.color && <label className="p-check"><input type="checkbox" checked={draft.onlyBorderColor} onChange={(event) => setDraft({ ...draft, onlyBorderColor: event.target.checked })} /> 只给边框上色</label>}
          </div>

          <div className="qr-items">
            {draft.replies.map((item, index) => {
              const expanded = open === item.key;
              return (
                <div className={`qr-item${expanded ? ' is-open' : ''}`} key={item.key}>
                  <div className="qr-item-head">
                    <button type="button" className="qr-item-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.key)}>
                      <span className="qr-item-label">{item.label || '未命名'}</span>
                      <span className="qr-item-preview">{item.hidden ? '隐藏 · ' : ''}{item.message.split('\n')[0] || '（空）'}</span>
                    </button>
                    <div className="qr-item-tools">
                      <button type="button" className="p-btn p-btn--sm" aria-label="上移" disabled={index === 0} onClick={() => moveItem(item.key, -1)}>↑</button>
                      <button type="button" className="p-btn p-btn--sm" aria-label="下移" disabled={index === draft.replies.length - 1} onClick={() => moveItem(item.key, 1)}>↓</button>
                      <button type="button" className="p-btn p-btn--sm" onClick={() => setDraft({ ...draft, replies: draft.replies.filter((entry) => entry.key !== item.key) })}>删除</button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="qr-item-body">
                      <div className="p-field-row">
                        <div className="p-field">
                          <label>按钮文字</label>
                          <input className="p-input" value={item.label} maxLength={60} onChange={(event) => updateItem(item.key, { label: event.target.value })} />
                        </div>
                        <div className="p-field" style={{ gridColumn: 'span 2' }}>
                          <label>悬停说明</label>
                          <input className="p-input" value={item.title} maxLength={300} onChange={(event) => updateItem(item.key, { title: event.target.value })} />
                        </div>
                      </div>
                      <div className="p-field">
                        <label>内容（普通文字直接发出；/ 开头按斜杠命令执行，| 串联）</label>
                        <textarea className="p-input qr-message" rows={4} value={item.message} spellCheck={false} placeholder={'*推开门，雨声涌进来*\n或：/setvar key=好感度 10 | /trigger'} onChange={(event) => updateItem(item.key, { message: event.target.value })} />
                      </div>
                      <div className="qr-flags">
                        <label className="p-check"><input type="checkbox" checked={item.hidden} onChange={(event) => updateItem(item.key, { hidden: event.target.checked })} /> 隐藏按钮（只能被 /qr 或自动执行调用）</label>
                        <label className="p-check"><input type="checkbox" checked={item.preventAuto} onChange={(event) => updateItem(item.key, { preventAuto: event.target.checked })} /> 不触发自动执行（这个按钮发出的消息和引起的回复不再触发其它自动执行）</label>
                      </div>
                      <div className="qr-sub">
                        <span className="qr-sub-k">自动执行</span>
                        {AUTO_LABELS.map(([key, label]) => (
                          <label className="p-check" key={key}>
                            <input type="checkbox" checked={item.auto[key]} onChange={(event) => updateItem(item.key, { auto: { ...item.auto, [key]: event.target.checked } })} /> {label}
                          </label>
                        ))}
                      </div>
                      <div className="qr-sub">
                        <span className="qr-sub-k">右键子菜单</span>
                        {state.sets.filter((set) => set.id !== draft.id).map((set) => {
                          const link = item.context.find((entry) => entry.setId === set.id);
                          return (
                            <span className="qr-ctx" key={set.id}>
                              <label className="p-check">
                                <input
                                  type="checkbox"
                                  checked={!!link}
                                  onChange={(event) => updateItem(item.key, { context: event.target.checked ? [...item.context, { setId: set.id, chain: false }] : item.context.filter((entry) => entry.setId !== set.id) })}
                                /> {set.name}
                              </label>
                              {link && (
                                <label className="p-check qr-ctx-chain" title="连那个集里按钮自己的子菜单也一起显示（ST：连锁）">
                                  <input type="checkbox" checked={link.chain} onChange={(event) => updateItem(item.key, { context: item.context.map((entry) => (entry.setId === set.id ? { ...entry, chain: event.target.checked } : entry)) })} /> 连锁
                                </label>
                              )}
                            </span>
                          );
                        })}
                        {state.sets.length < 2 && <span className="small">再建一个集，就能把它挂成这个按钮的子菜单。</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className="p-btn p-btn--sm"
              type="button"
              onClick={() => {
                const item = blankItem(draft.replies.length);
                setDraft({ ...draft, replies: [...draft.replies, item] });
                setOpen(item.key);
              }}
            >
              添加按钮
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
