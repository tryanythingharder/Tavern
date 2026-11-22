'use client';

import { useMemo, useRef, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { Select } from '@/components/ui-select';
import { askConfirm } from '@/components/ui-dialog';
import type { DataBankPrefs } from '@/lib/gen-prefs';

type Scope = 'global' | 'character' | 'chat' | 'room';
type FileView = { id: number; scope: Scope; scopeId: string; name: string; size: number; enabled: boolean; createdAt: number; preview: string };
type Option = { id: string; label: string };
export type DataBankTargets = { characters: Option[]; chats: Option[]; rooms: Option[] };

const SCOPE_LABEL: Record<Scope, string> = { global: '全局', character: '角色', chat: '聊天', room: '群聊' };
const ACCEPT = '.pdf,.docx,.epub,.odt,.txt,.md,.markdown,.json,.csv,.tsv,.log,.xml,.yaml,.yml,.html,.htm,.srt,.ini';

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ST Vector Storage 的文件设置（Data Bank）
function DataBankSettings({ initial, ready }: { initial: DataBankPrefs; ready: boolean }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const save = async (patch: Partial<DataBankPrefs>) => {
    const before = value;
    setValue({ ...value, ...patch });
    setError('');
    try {
      const result = await api<{ prefs: { dataBank: DataBankPrefs } }>('/api/me/gen-prefs', { method: 'PATCH', body: JSON.stringify({ dataBank: patch }) });
      setValue(result.prefs.dataBank);
    } catch (caught) {
      setValue(before);
      setError((caught as Error).message);
    }
  };
  const num = (key: 'sizeThresholdKb' | 'chunkSize' | 'chunkOverlap' | 'chunkCount' | 'threshold', label: string, unit: string, props: { min: number; max: number; step?: number }) => (
    <label className="lb-vectors-num">
      <span>{label}</span>
      <input className="p-input" type="number" {...props} value={value[key]} onChange={(event) => setValue({ ...value, [key]: Number(event.target.value) })} onBlur={() => void save({ [key]: value[key] })} />
      {unit ? <span>{unit}</span> : null}
    </label>
  );
  return (
    <div className="lb-vectors">
      <label className="p-check">
        <input type="checkbox" checked={value.enabled} onChange={(event) => void save({ enabled: event.target.checked })} />
        <span>生成时使用资料库</span>
      </label>
      <span className="hint">
        小于阈值的资料整篇放进上下文；大的切成块，按和最近对话的相关度取几块。{ready ? '' : '站点还没配置向量接口，大资料暂时按关键词挑块。'}
      </span>
      {value.enabled && (
        <>
          <div className="lb-vectors-row">
            {num('sizeThresholdKb', '整篇放入上限', 'KB', { min: 0, max: 1024 })}
            {num('chunkSize', '每块', '字', { min: 200, max: 20000, step: 100 })}
            {num('chunkOverlap', '块重叠', '%', { min: 0, max: 50 })}
            {num('chunkCount', '每次取', '块', { min: 1, max: 50 })}
            {ready ? num('threshold', '相似度阈值', '', { min: 0, max: 1, step: 0.05 }) : null}
          </div>
          <label className="db-template">
            <span>插入模板（{'{{text}}'} 换成资料内容）</span>
            <textarea className="p-textarea" rows={2} value={value.template} onChange={(event) => setValue({ ...value, template: event.target.value })} onBlur={() => void save({ template: value.template })} />
          </label>
        </>
      )}
      <ErrorLine message={error} />
    </div>
  );
}

export function DataBankEditor({ initial, prefs, ready, targets, preset }: { initial: FileView[]; prefs: DataBankPrefs; ready: boolean; targets: DataBankTargets; preset?: { scope: Scope; scopeId: string } }) {
  const [files, setFiles] = useState<FileView[]>(initial);
  const [scope, setScope] = useState<Scope>(preset?.scope ?? 'global');
  const [scopeId, setScopeId] = useState(preset?.scopeId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState<{ name: string; content: string } | null>(null);
  const [viewing, setViewing] = useState<{ id: number; name: string; content: string } | null>(null);
  const [filter, setFilter] = useState<'all' | Scope>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const options = scope === 'character' ? targets.characters : scope === 'chat' ? targets.chats : scope === 'room' ? targets.rooms : [];
  const labelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of targets.characters) map.set(`character:${item.id}`, item.label);
    for (const item of targets.chats) map.set(`chat:${item.id}`, item.label);
    for (const item of targets.rooms) map.set(`room:${item.id}`, item.label);
    return (file: FileView) => (file.scope === 'global' ? '全局' : `${SCOPE_LABEL[file.scope]} · ${map.get(`${file.scope}:${file.scopeId}`) ?? '已删除'}`);
  }, [targets]);
  const ready2 = scope === 'global' || Boolean(scopeId);

  const add = async (name: string, content: string) => {
    const result = await api<{ file: FileView }>('/api/data-bank', { method: 'POST', body: JSON.stringify({ scope, scopeId, name, content }) });
    setFiles((prev) => [result.file, ...prev]);
  };
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(list)) {
        if (/\.(doc|wps|rtf|pages)$/i.test(file.name)) throw new Error(`「${file.name}」：旧版 Word（.doc）等格式读不了，请另存为 .docx 或 PDF`);
        if (/\.(pdf|docx|epub|odt)$/i.test(file.name)) {
          if (file.size > 20 * 1024 * 1024) throw new Error(`「${file.name}」超过 20 MB`);
          const form = new FormData();
          form.append('file', file);
          form.append('scope', scope);
          form.append('scopeId', scopeId);
          const response = await fetch('/api/data-bank/upload', { method: 'POST', body: form });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || `上传失败（${response.status}）`);
          setFiles((prev) => [data.file, ...prev]);
          continue;
        }
        if (file.size > 8 * 1024 * 1024) throw new Error(`「${file.name}」超过 8 MB`);
        await add(file.name, await file.text());
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const patch = async (id: number, body: Partial<FileView>) => {
    try {
      const result = await api<{ file: FileView }>(`/api/data-bank/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setFiles((prev) => prev.map((item) => (item.id === id ? result.file : item)));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const remove = async (file: FileView) => {
    if (!(await askConfirm({ message: `删除资料「${file.name}」？`, confirmLabel: '删除', danger: true }))) return;
    try {
      await api(`/api/data-bank/${file.id}`, { method: 'DELETE' });
      setFiles((prev) => prev.filter((item) => item.id !== file.id));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const open = async (file: FileView) => {
    try {
      const result = await api<{ file: { content: string } }>(`/api/data-bank/${file.id}`);
      setViewing({ id: file.id, name: file.name, content: result.file.content });
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const shown = filter === 'all' ? files : files.filter((item) => item.scope === filter);

  return (
    <>
      <DataBankSettings initial={prefs} ready={ready} />

      <div className="db-add">
        <div className="db-add-scope">
          <Select className="p-input" aria-label="作用范围" value={scope} onChange={(event) => { setScope(event.target.value as Scope); setScopeId(''); }}>
            <option value="global">全局（所有聊天）</option>
            <option value="character">某个角色的所有聊天</option>
            <option value="chat">只这段聊天</option>
            <option value="room">只这个群聊</option>
          </Select>
          {scope !== 'global' && (
            <Select className="p-input" aria-label={`选择${SCOPE_LABEL[scope]}`} value={scopeId} onChange={(event) => setScopeId(event.target.value)}>
              <option value="">选择{SCOPE_LABEL[scope]}…</option>
              {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </Select>
          )}
        </div>
        <div className="db-add-actions">
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(event) => void upload(event.target.files)} />
          <button className="btn btn--primary btn--sm" type="button" disabled={busy || !ready2} onClick={() => inputRef.current?.click()}>{busy ? '上传中…' : '上传文件'}</button>
          <button className="p-btn p-btn--sm" type="button" disabled={!ready2} onClick={() => setPaste({ name: '', content: '' })}>粘贴文字</button>
        </div>
      </div>
      <ErrorLine message={error} />

      {files.length > 0 && (
        <div className="db-filter" role="group" aria-label="按范围筛选">
          {(['all', 'global', 'character', 'chat', 'room'] as const).map((key) => (
            <button key={key} type="button" className={`p-chip${filter === key ? ' is-on' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === 'all' ? `全部 ${files.length}` : `${SCOPE_LABEL[key]} ${files.filter((item) => item.scope === key).length}`}
            </button>
          ))}
        </div>
      )}

      <div className="p-rows">
        {shown.map((file) => (
          <div className={`p-room-card${file.enabled ? '' : ' is-off'}`} key={file.id}>
            <div className="p-room-main">
              <div className="p-room-title">{file.name}</div>
              <div className="p-room-last">{labelOf(file)} · {sizeText(file.size)}{file.size > prefs.sizeThresholdKb * 1024 ? ' · 分块检索' : ' · 整篇放入'}</div>
            </div>
            <div className="p-library-actions">
              <label className="check lb-global" title="关掉后生成时不用这份资料">
                <input type="checkbox" checked={file.enabled} onChange={(event) => void patch(file.id, { enabled: event.target.checked })} />
                <span>启用</span>
              </label>
              <button className="p-btn p-btn--sm" type="button" onClick={() => void open(file)}>查看</button>
              <button className="p-btn p-btn--sm" type="button" onClick={() => void remove(file)}>删除</button>
            </div>
          </div>
        ))}
        {!files.length && <p className="small">还没有资料。上传设定集、长篇背景、规则文档（txt、md、PDF、Word、EPUB 等），角色生成时会参考（ST 的 Data Bank）。</p>}
      </div>

      {paste && (
        <Modal
          title="粘贴文字"
          onClose={() => setPaste(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setPaste(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy || !paste.content.trim()} onClick={async () => {
                setBusy(true); setError('');
                try { await add(paste.name || '粘贴的资料', paste.content); setPaste(null); } catch (caught) { setError((caught as Error).message); } finally { setBusy(false); }
              }}>保存</button>
            </>
          }
        >
          <div className="p-field">
            <label htmlFor="db-paste-name">名称</label>
            <input id="db-paste-name" className="p-input" value={paste.name} maxLength={120} placeholder="例如：雾港地理设定" onChange={(event) => setPaste({ ...paste, name: event.target.value })} />
          </div>
          <div className="p-field">
            <label htmlFor="db-paste-body">内容</label>
            <textarea id="db-paste-body" className="p-textarea" rows={12} value={paste.content} onChange={(event) => setPaste({ ...paste, content: event.target.value })} />
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal
          title={viewing.name}
          onClose={() => setViewing(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setViewing(null)}>关闭</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!viewing.content.trim()} onClick={async () => {
                const id = viewing.id;
                try {
                  const result = await api<{ file: FileView }>(`/api/data-bank/${id}`, { method: 'PATCH', body: JSON.stringify({ content: viewing.content }) });
                  setFiles((prev) => prev.map((item) => (item.id === id ? result.file : item)));
                  setViewing(null);
                } catch (caught) { setError((caught as Error).message); }
              }}>保存修改</button>
            </>
          }
        >
          <textarea className="p-textarea db-view" rows={18} value={viewing.content} aria-label="资料内容" onChange={(event) => setViewing({ ...viewing, content: event.target.value })} />
        </Modal>
      )}
    </>
  );
}
