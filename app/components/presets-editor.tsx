'use client';

import { useState } from 'react';
import { PROMPT_BLOCKS, defaultPreset, type Preset, type PresetParams } from '@/lib/resources';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

const PARAM_FIELDS: [keyof PresetParams, string, number, number, number][] = [
  ['temperature', 'temperature', 0, 2, 0.05],
  ['topP', 'top_p', 0.05, 1, 0.01],
  ['topK', 'top_k', 0, 200, 1],
  ['minP', 'min_p', 0, 1, 0.01],
  ['typicalP', 'typical_p', 0, 1, 0.01],
  ['repetitionPenalty', 'repetition_penalty', 1, 2, 0.01],
  ['presencePenalty', 'presence_penalty', -2, 2, 0.01],
  ['frequencyPenalty', 'frequency_penalty', -2, 2, 0.01],
  ['maxTokens', 'max_tokens', 16, 8192, 16],
  ['seed', 'seed', -1, 2147483647, 1],
];

const blockLabel = (key: string) => PROMPT_BLOCKS.find(([value]) => value === key)?.[1] ?? key;

function newDraft(): Preset {
  return { id: 0, ...defaultPreset() };
}

export function PresetsEditor({ initial }: { initial: Preset[] }) {
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [draft, setDraft] = useState<Preset | null>(null);
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
        system: draft.system,
        jailbreak: draft.jailbreak,
        params: draft.params,
        contextTemplate: draft.contextTemplate,
        instruct: draft.instruct,
        order: draft.order,
        forbidOverrides: draft.forbidOverrides,
      };
      if (draft.id) {
        const { preset } = await api<{ preset: Preset }>(`/api/presets/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setPresets((prev) => prev.map((item) => (item.id === preset.id ? preset : item)));
      } else {
        const { preset } = await api<{ preset: Preset }>('/api/presets', { method: 'POST', body: JSON.stringify(payload) });
        setPresets((prev) => [preset, ...prev]);
      }
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (preset: Preset) => {
    setError('');
    try {
      const { preset: created } = await api<{ preset: Preset }>('/api/presets', {
        method: 'POST',
        body: JSON.stringify({ ...preset, name: `${preset.name} 副本` }),
      });
      setPresets((prev) => [created, ...prev]);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/presets/${id}`, { method: 'DELETE' });
      setPresets((prev) => prev.filter((item) => item.id !== id));
      setConfirmId(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const runImport = async () => {
    setImportError('');
    try {
      const { preset } = await api<{ preset: Preset }>('/api/presets/import', { method: 'POST', body: JSON.stringify({ json: importText }) });
      setPresets((prev) => [preset, ...prev]);
      setImportOpen(false);
      setImportText('');
    } catch (caught) {
      setImportError((caught as Error).message);
    }
  };

  const move = (index: number, delta: number) => {
    if (!draft) return;
    const order = [...draft.order];
    const next = index + delta;
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    setDraft({ ...draft, order });
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => setDraft(newDraft())}>新建预设</button>
        <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(true)}>导入 ST 预设</button>
      </div>
      <ErrorLine message={error} />

      <div className="p-rows">
        {presets.map((preset) => (
          <div className="p-room-card" key={preset.id}>
            <div className="p-room-main">
              <div className="p-room-title">{preset.name}</div>
              <div className="p-room-last">
                温度 {preset.params.temperature} · top_p {preset.params.topP} · 上限 {preset.params.maxTokens} tokens
                {preset.instruct.enabled ? ' · Instruct 已开启' : ''}
              </div>
            </div>
            <div className="p-library-actions">
              {confirmId === preset.id ? (
                <>
                  <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={() => void remove(preset.id)}>确认删除</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft({ ...preset })}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => void duplicate(preset)}>复制</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(preset.id)}>删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!presets.length && <p className="small">还没有预设。新建一个，或从 SillyTavern 导入。</p>}
      </div>

      {draft && (
        <Modal
          title={draft.id ? '编辑预设' : '新建预设'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>
                {busy ? '保存中…' : '保存'}
              </button>
            </>
          }
        >
          <ErrorLine message={error} />
          <div className="p-field">
            <label htmlFor="preset-name">名称</label>
            <input id="preset-name" className="p-input" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="p-field">
            <label htmlFor="preset-system">系统提示</label>
            <textarea id="preset-system" className="p-textarea" rows={5} value={draft.system} onChange={(event) => setDraft({ ...draft, system: event.target.value })} />
          </div>
          <div className="p-field">
            <label htmlFor="preset-jailbreak">后置提示（预设末尾补充规则）</label>
            <textarea id="preset-jailbreak" className="p-textarea" rows={3} value={draft.jailbreak} onChange={(event) => setDraft({ ...draft, jailbreak: event.target.value })} />
          </div>

          <h3 className="p-form-section-title">采样参数</h3>
          <div className="p-field-row">
            {PARAM_FIELDS.map(([key, label, min, max, step]) => (
              <div className="p-field" key={key} style={{ marginBottom: 8 }}>
                <label htmlFor={`param-${key}`}>{label}</label>
                <input
                  id={`param-${key}`}
                  className="p-input"
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={draft.params[key]}
                  onChange={(event) => setDraft({ ...draft, params: { ...draft.params, [key]: Number(event.target.value) } })}
                />
              </div>
            ))}
          </div>

          <h3 className="p-form-section-title" style={{ marginTop: 8 }}>上下文模板</h3>
          <div className="p-field">
            <textarea className="p-textarea" rows={7} value={draft.contextTemplate} onChange={(event) => setDraft({ ...draft, contextTemplate: event.target.value })} />
            <span className="p-hint">占位符：{`{{char}} {{hook}} {{description}} {{personality}} {{scenario}} {{legacy}} {{instructions}}`}；占位符为空的整行会自动省略。</span>
          </div>

          <h3 className="p-form-section-title">Instruct 序列</h3>
          <label className="p-check" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={draft.instruct.enabled} onChange={(event) => setDraft({ ...draft, instruct: { ...draft.instruct, enabled: event.target.checked } })} />
            <span>启用（每条历史消息前加前缀，末尾追加停止序列）</span>
          </label>
          <div className="p-field-row">
            {([['input', '玩家前缀'], ['output', '角色前缀'], ['system', '系统前缀'], ['stop', '停止序列']] as const).map(([key, label]) => (
              <div className="p-field" key={key} style={{ marginBottom: 8 }}>
                <label>{label}</label>
                <input
                  className="p-input"
                  value={draft.instruct[key]}
                  placeholder={key === 'input' ? 'USER: ' : key === 'output' ? 'CHAR: ' : ''}
                  onChange={(event) => setDraft({ ...draft, instruct: { ...draft.instruct, [key]: event.target.value } })}
                />
              </div>
            ))}
          </div>

          <h3 className="p-form-section-title" style={{ marginTop: 8 }}>提示块顺序</h3>
          <div className="block-order">
            {draft.order.map((item, index) => (
              <div className="block-order-row" key={item.key}>
                <input
                  type="checkbox"
                  checked={item.enabled}
                  aria-label={`启用 ${blockLabel(item.key)}`}
                  onChange={(event) => {
                    const order = draft.order.map((entry, at) => (at === index ? { ...entry, enabled: event.target.checked } : entry));
                    setDraft({ ...draft, order });
                  }}
                />
                <span className="name">{blockLabel(item.key)}</span>
                <button className="icon-btn" type="button" aria-label="上移" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button className="icon-btn" type="button" aria-label="下移" disabled={index === draft.order.length - 1} onClick={() => move(index, 1)}>↓</button>
              </div>
            ))}
          </div>

          <label className="p-check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={draft.forbidOverrides} onChange={(event) => setDraft({ ...draft, forbidOverrides: event.target.checked })} />
            <span>禁止角色卡覆盖系统提示（ST 的 forbid_overrides）</span>
          </label>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="导入 SillyTavern 预设"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setImportOpen(false)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={!importText.trim()} onClick={() => void runImport()}>导入</button>
            </>
          }
        >
          <ErrorLine message={importError} />
          <p className="small" style={{ marginTop: 0 }}>
            粘贴 ST 预设 JSON：读取采样参数、系统提示 / 后置提示、story_string 上下文模板与 instruct 序列。导入会新增一个预设，不覆盖现有预设。
          </p>
          <textarea className="p-textarea" rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"temperature":1,"prompts":[{"identifier":"main","content":"…"}]}' />
        </Modal>
      )}
    </>
  );
}
