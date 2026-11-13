'use client';

import { useState } from 'react';
import type { RegexRule } from '@/lib/resources';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

const SCOPE_LABEL: Record<string, string> = { both: '发送 + 展示', send: '仅发送', display: '仅展示' };
const TARGET_LABEL: Record<string, string> = { all: '全部消息', assistant: '角色消息', user: '玩家消息' };

function blankRule(): RegexRule {
  return { id: 0, name: '新的规则', find: '', replacement: '', scope: 'both', target: 'all', enabled: true, depthFrom: null, depthTo: null, sort: 0 };
}

export function RegexEditor({ initial }: { initial: RegexRule[] }) {
  const [rules, setRules] = useState<RegexRule[]>(initial);
  const [draft, setDraft] = useState<RegexRule | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: draft.name,
        find: draft.find,
        replacement: draft.replacement,
        scope: draft.scope,
        target: draft.target,
        enabled: draft.enabled,
        depthFrom: draft.depthFrom,
        depthTo: draft.depthTo,
      };
      if (draft.id) {
        const { rule } = await api<{ rule: RegexRule }>(`/api/regex/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setRules((prev) => prev.map((item) => (item.id === rule.id ? rule : item)));
      } else {
        const { rule } = await api<{ rule: RegexRule }>('/api/regex', { method: 'POST', body: JSON.stringify(payload) });
        setRules((prev) => [...prev, rule]);
      }
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule: RegexRule) => {
    setError('');
    try {
      const { rule: updated } = await api<{ rule: RegexRule }>(`/api/regex/${rule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !rule.enabled }) });
      setRules((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/regex/${id}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((item) => item.id !== id));
      setConfirmId(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const runImport = async () => {
    setImportError('');
    try {
      const { rules: created } = await api<{ rules: RegexRule[] }>('/api/regex/import', { method: 'POST', body: JSON.stringify({ json: importText }) });
      setRules((prev) => [...prev, ...created]);
      setImportOpen(false);
      setImportText('');
    } catch (caught) {
      setImportError((caught as Error).message);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setDraft(blankRule())}>新建规则</button>
        <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(true)}>导入 ST 正则</button>
      </div>
      <ErrorLine message={error} />

      <div className="p-rows">
        {rules.map((rule) => (
          <div className="p-room-card" key={rule.id}>
            <div className="p-room-main">
              <div className="p-room-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {rule.name}
                <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 20, padding: '0 8px', fontSize: 10.5 }}>{SCOPE_LABEL[rule.scope]}</span>
                <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 20, padding: '0 8px', fontSize: 10.5 }}>{TARGET_LABEL[rule.target]}</span>
                {!rule.enabled && <span className="p-pill p-pill--sm p-pill--outline" style={{ height: 20, padding: '0 8px', fontSize: 10.5 }}>停用</span>}
              </div>
              <div className="p-room-last">{rule.find}</div>
            </div>
            <div className="p-library-actions">
              {confirmId === rule.id ? (
                <>
                  <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={() => void remove(rule.id)}>确认删除</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => void toggle(rule)}>{rule.enabled ? '停用' : '启用'}</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft({ ...rule })}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(rule.id)}>删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!rules.length && <p className="small">还没有规则。查找内容写成 /表达式/flags 按正则处理，其余按纯文本替换。</p>}
      </div>

      {draft && (
        <Modal
          title={draft.id ? '编辑正则规则' : '新建正则规则'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy || !draft.find.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          <div className="p-field">
            <label>名称</label>
            <input className="p-input" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="p-field">
            <label>查找</label>
            <input className="p-input" value={draft.find} placeholder="/（.+?）/g 或纯文本" onChange={(event) => setDraft({ ...draft, find: event.target.value })} />
          </div>
          <div className="p-field">
            <label>替换为</label>
            <input className="p-input" value={draft.replacement} placeholder="可以留空（删除匹配内容）" onChange={(event) => setDraft({ ...draft, replacement: event.target.value })} />
          </div>
          <div className="p-field-row">
            <div className="p-field">
              <label>作用范围</label>
              <select className="p-select" value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value as RegexRule['scope'] })}>
                <option value="both">发送 + 展示</option>
                <option value="send">仅发送（进入上下文前）</option>
                <option value="display">仅展示（生成结果落库前）</option>
              </select>
            </div>
            <div className="p-field">
              <label>作用对象</label>
              <select className="p-select" value={draft.target} onChange={(event) => setDraft({ ...draft, target: event.target.value as RegexRule['target'] })}>
                <option value="all">全部消息</option>
                <option value="assistant">角色消息</option>
                <option value="user">玩家消息</option>
              </select>
            </div>
            <div className="p-field">
              <label>深度从</label>
              <input className="p-input" type="number" value={draft.depthFrom ?? ''} placeholder="不限" onChange={(event) => setDraft({ ...draft, depthFrom: event.target.value === '' ? null : Number(event.target.value) })} />
            </div>
            <div className="p-field">
              <label>深度到</label>
              <input className="p-input" type="number" value={draft.depthTo ?? ''} placeholder="不限" onChange={(event) => setDraft({ ...draft, depthTo: event.target.value === '' ? null : Number(event.target.value) })} />
            </div>
          </div>
          <label className="p-check">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
            <span>启用</span>
          </label>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="导入 SillyTavern 正则"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(false)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!importText.trim()} onClick={() => void runImport()}>导入</button>
            </>
          }
        >
          <ErrorLine message={importError} />
          <p className="small" style={{ marginTop: 0 }}>粘贴 ST 正则扩展导出的 JSON（含 regex_scripts，或直接是规则数组）。</p>
          <textarea className="p-textarea" rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"regex_scripts":[{"scriptName":"清理状态栏","findRegex":"/【状态】.*$/gm","replaceString":""}]}' />
        </Modal>
      )}
    </>
  );
}
