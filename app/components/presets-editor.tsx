'use client';

import { useRef, useState } from 'react';
import { PROMPT_BLOCKS, PROMPT_TRIGGERS, defaultPreset, promptKey, type Preset, type PresetParams, type PresetPrompt } from '@/lib/resources';
import { Select } from '@/components/ui-select';
import { askConfirm } from '@/components/ui-dialog';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { PARAM_FIELDS } from '@/lib/param-fields';
import { usePlayMode } from '@/components/play-mode';



const blockLabel = (key: string) => PROMPT_BLOCKS.find(([value]) => value === key)?.[1] ?? key;
const ROLE_LABEL: Record<string, string> = { system: '系统', user: '玩家', assistant: '角色' };
const newPromptId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const promptBadge = (prompt: PresetPrompt) => `${ROLE_LABEL[prompt.role]}${prompt.position === 'depth' ? ` · 聊天内 @${prompt.depth}` : ''}${prompt.triggers.length ? ' · 限定触发' : ''}`;

function newDraft(): Preset {
  return { id: 0, ...defaultPreset() };
}

export function PresetsEditor({ initial }: { initial: Preset[] }) {
  const mode = usePlayMode();
  const [more, setMore] = useState(false);
  // 「酒馆全功能」全部展开；「简单功能」/ 新手只露常用参数，其余点「更多参数」
  const expanded = mode === 'full' || more;
  const [presets, setPresets] = useState<Preset[]>(initial);
  const [draft, setDraft] = useState<Preset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [openPrompt, setOpenPrompt] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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
        prompts: draft.prompts,
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

  const runImport = async (source = importText) => {
    setImportError('');
    try {
      const { preset } = await api<{ preset: Preset }>('/api/presets/import', { method: 'POST', body: JSON.stringify({ json: source }) });
      setPresets((prev) => [preset, ...prev]);
      setImportOpen(false);
      setImportText('');
      return true;
    } catch (caught) {
      setImportError((caught as Error).message);
      return false;
    }
  };

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const ok = await runImport(await file.text());
      if (!ok) break;
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportSt = (preset: Preset) => {
    const link = document.createElement('a');
    link.href = `/api/presets/${preset.id}?format=st`;
    link.download = `${preset.name}.json`;
    link.click();
  };

  const updatePrompt = (id: string, patch: Partial<PresetPrompt>) => {
    if (!draft) return;
    setDraft({ ...draft, prompts: draft.prompts.map((prompt) => (prompt.id === id ? { ...prompt, ...patch } : prompt)) });
  };
  const addPrompt = () => {
    if (!draft) return;
    const prompt: PresetPrompt = { id: newPromptId(), name: '新条目', role: 'system', content: '', position: 'relative', depth: 4, order: 100, triggers: [] };
    // 新条目默认放在「最近消息」前面（ST 新建条目也是先在列表里，用户再拖）
    const at = draft.order.findIndex((item) => item.key === 'history');
    const order = [...draft.order];
    order.splice(at < 0 ? order.length : at, 0, { key: promptKey(prompt.id), enabled: true });
    setDraft({ ...draft, prompts: [...draft.prompts, prompt], order });
    setOpenPrompt(prompt.id);
  };
  const removePrompt = async (id: string) => {
    if (!draft) return;
    const prompt = draft.prompts.find((item) => item.id === id);
    if (!(await askConfirm({ message: `删除条目「${prompt?.name ?? ''}」？`, confirmLabel: '删除', danger: true }))) return;
    setDraft({ ...draft, prompts: draft.prompts.filter((item) => item.id !== id), order: draft.order.filter((item) => item.key !== promptKey(id)) });
  };
  const toggleKey = (key: string, enabled: boolean) => {
    if (!draft) return;
    setDraft({ ...draft, order: draft.order.map((entry) => (entry.key === key ? { ...entry, enabled } : entry)) });
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
        <input ref={fileRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
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
                {preset.prompts.length ? <span>{` · ${preset.prompts.length} 个自定义条目（开 ${preset.prompts.filter((prompt) => preset.order.some((item) => item.key === promptKey(prompt.id) && item.enabled)).length}）`}</span> : null}
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
                  <button className="p-btn p-btn--sm" type="button" onClick={() => { setOpenPrompt(null); setDraft({ ...preset }); }}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => void duplicate(preset)}>复制</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => exportSt(preset)}>导出</button>
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

          {!expanded && draft.prompts.length > 0 && (
            <>
              <h3 className="p-form-section-title">预设开关</h3>
              <p className="p-hint" style={{ marginTop: 0 }}>预设作者准备的可选规则，按需打开或关掉。</p>
              <div className="pm-toggles">
                {draft.order.filter((item) => item.key.startsWith('p:')).map((item) => {
                  const prompt = draft.prompts.find((entry) => promptKey(entry.id) === item.key);
                  if (!prompt) return null;
                  return (
                    <label className="p-check" key={item.key}>
                      <input type="checkbox" checked={item.enabled} onChange={(event) => toggleKey(item.key, event.target.checked)} />
                      <span>{prompt.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          <h3 className="p-form-section-title">采样参数</h3>
          <div className="p-field-row">
            {PARAM_FIELDS.filter((field) => expanded || field.core).map(({ key, label, min, max, step, help }) => (
              <div className="p-field" key={key} style={{ marginBottom: 8 }}>
                <label htmlFor={`param-${key}`} title={help}>{label}</label>
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

          {mode !== 'full' && (
            <button type="button" className="pm-more" aria-expanded={more} onClick={() => setMore((value) => !value)}>
              {more ? '收起更多参数' : `更多参数（${PARAM_FIELDS.filter((field) => !field.core).length} 项采样参数、上下文模板、Instruct、提示词管理）`}
            </button>
          )}

          {expanded && (<>
          <h3 className="p-form-section-title" style={{ marginTop: 8 }}>上下文模板</h3>
          <div className="p-field">
            <textarea className="p-textarea" rows={7} value={draft.contextTemplate} onChange={(event) => setDraft({ ...draft, contextTemplate: event.target.value })} />
            <span className="p-hint">占位符：{`{{char}} {{hook}} {{description}} {{personality}} {{scenario}} {{persona}} {{wiBefore}} {{wiAfter}} {{mesExamples}} {{instructions}}`}；占位符为空的整行会自动省略。也可以直接用 ST 的 story_string 写法（{`{{#if 变量}}…{{else}}…{{/if}}、{{#unless}}、{{trim}}`}）；模板里用了世界书、示例或身份，对应的独立块就不再重复。</span>
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

          <h3 className="p-form-section-title" style={{ marginTop: 8 }}>提示词管理</h3>
          <p className="p-hint" style={{ marginTop: 0 }}>同 ST 的 Prompt Manager：从上到下就是发给模型的顺序。内置块由系统填内容；自定义条目按自己的角色单独成一条，放「聊天内」的按深度插进聊天记录。</p>
          <div className="block-order">
            {draft.order.map((item, index) => {
              const prompt = item.key.startsWith('p:') ? draft.prompts.find((entry) => promptKey(entry.id) === item.key) : undefined;
              if (item.key.startsWith('p:') && !prompt) return null;
              const name = prompt ? prompt.name : blockLabel(item.key);
              const isOpen = prompt && openPrompt === prompt.id;
              return (
                <div className={`block-order-item${isOpen ? ' is-open' : ''}`} key={item.key}>
                  <div className="block-order-row">
                    <input type="checkbox" checked={item.enabled} aria-label={`启用 ${name}`} onChange={(event) => toggleKey(item.key, event.target.checked)} />
                    <span className="name">
                      {name}
                      <span className="pm-badge">{prompt ? promptBadge(prompt) : '内置'}</span>
                    </span>
                    {prompt && (
                      <>
                        <button className="icon-btn" type="button" aria-label={`编辑 ${name}`} aria-expanded={Boolean(isOpen)} onClick={() => setOpenPrompt(isOpen ? null : prompt.id)}>✎</button>
                        <button className="icon-btn" type="button" aria-label={`删除 ${name}`} onClick={() => void removePrompt(prompt.id)}>✕</button>
                      </>
                    )}
                    <button className="icon-btn" type="button" aria-label="上移" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                    <button className="icon-btn" type="button" aria-label="下移" disabled={index === draft.order.length - 1} onClick={() => move(index, 1)}>↓</button>
                  </div>
                  {prompt && isOpen && (
                    <div className="pm-edit">
                      <div className="p-field-row">
                        <div className="p-field">
                          <label htmlFor={`pm-name-${prompt.id}`}>名称</label>
                          <input id={`pm-name-${prompt.id}`} className="p-input" value={prompt.name} maxLength={80} onChange={(event) => updatePrompt(prompt.id, { name: event.target.value })} />
                        </div>
                        <div className="p-field">
                          <label htmlFor={`pm-role-${prompt.id}`}>角色</label>
                          <Select id={`pm-role-${prompt.id}`} value={prompt.role} onChange={(event) => updatePrompt(prompt.id, { role: event.target.value as PresetPrompt['role'] })}>
                            <option value="system">系统 system</option>
                            <option value="user">玩家 user</option>
                            <option value="assistant">角色 assistant</option>
                          </Select>
                        </div>
                        <div className="p-field">
                          <label htmlFor={`pm-pos-${prompt.id}`}>位置</label>
                          <Select id={`pm-pos-${prompt.id}`} value={prompt.position} onChange={(event) => updatePrompt(prompt.id, { position: event.target.value === 'depth' ? 'depth' : 'relative' })}>
                            <option value="relative">按列表顺序（相对）</option>
                            <option value="depth">聊天内（按深度）</option>
                          </Select>
                        </div>
                        {prompt.position === 'depth' && (
                          <>
                            <div className="p-field">
                              <label htmlFor={`pm-depth-${prompt.id}`}>深度</label>
                              <input id={`pm-depth-${prompt.id}`} className="p-input" type="number" min={0} max={999} value={prompt.depth} onChange={(event) => updatePrompt(prompt.id, { depth: Number(event.target.value) })} />
                            </div>
                            <div className="p-field">
                              <label htmlFor={`pm-order-${prompt.id}`} title="同深度同角色时小的在前">顺序</label>
                              <input id={`pm-order-${prompt.id}`} className="p-input" type="number" value={prompt.order} onChange={(event) => updatePrompt(prompt.id, { order: Number(event.target.value) })} />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="p-field">
                        <label htmlFor={`pm-content-${prompt.id}`}>内容</label>
                        <textarea id={`pm-content-${prompt.id}`} className="p-textarea" rows={6} value={prompt.content} onChange={(event) => updatePrompt(prompt.id, { content: event.target.value })} />
                        <span className="p-hint">支持宏：{'{{char}} {{user}} {{persona}} {{getvar::名}} {{random::a,b}}'} 等。</span>
                      </div>
                      <div className="p-field">
                        <label>触发（都不勾 = 全部生成类型）</label>
                        <div className="pm-triggers">
                          {PROMPT_TRIGGERS.map(([key, label]) => (
                            <label className="p-check" key={key}>
                              <input
                                type="checkbox"
                                checked={prompt.triggers.includes(key)}
                                onChange={(event) => updatePrompt(prompt.id, { triggers: event.target.checked ? [...prompt.triggers, key] : prompt.triggers.filter((value) => value !== key) })}
                              />
                              <span>{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="p-btn p-btn--sm" type="button" style={{ marginTop: 8 }} onClick={addPrompt}>添加条目</button>

          </>)}

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
            选文件或粘贴 ST 预设 JSON：采样参数、主提示 / 后置提示、全部自定义条目（角色、聊天内深度、顺序、开关、触发器）、story_string 与 instruct 都会读进来。导入会新增一个预设，不覆盖现有预设。
          </p>
          <button className="p-btn p-btn--sm" type="button" style={{ marginBottom: 10 }} onClick={() => fileRef.current?.click()}>选择 JSON 文件…</button>
          <textarea className="p-textarea" rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder='{"temperature":1,"prompts":[{"identifier":"main","content":"…"}]}' />
        </Modal>
      )}
    </>
  );
}
