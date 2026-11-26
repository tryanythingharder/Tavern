'use client';

import { LocalTime, formatTime } from '@/components/local-time';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { useNotice } from '@/components/admin-feedback';
import { Select } from '@/components/ui-select';
import { INSTRUCT_PRESETS, parseInstructJson } from '@/lib/instruct';
import { ChannelTestModal, type ChannelTestRecord, type ChannelTestTarget } from '@/components/admin-channel-test';

export type ChannelView = {
  id: number;
  name: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  priority: number;
  enabled: boolean;
  apiMode?: 'chat' | 'text';
  textTemplate?: string;
  hasKey: boolean;
  lastTestAt: number | null;
  lastTestOk: boolean | null;
  lastTestNote: string;
};

export type OtherGateway = {
  name: string;
  endpoint: string;
  model: string;
  ok: boolean;
  href: string;
  kind: 'image' | 'tts' | 'payment' | 'mail';
};

// 旧版「单线路配置」（环境变量 TAVERN_MODEL_* / 旧后台设置）里完整的线路；active = 一条渠道都没有、正在用它
export type LegacyRoutes = { routes: { baseUrl: string; model: string }[]; active: boolean };

function relative(value: number | null): string {
  if (!value) return '还没测试';
  const diff = Date.now() - value;
  if (diff < 60_000) return '刚刚测试';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前测试`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前测试`;
  return `${formatTime(value, 'date')} 测试`;
}

function ChannelForm({
  editing,
  onClose,
  onSaved,
}: {
  editing: ChannelView | 'new';
  onClose: () => void;
  onSaved: (channel: ChannelView) => void;
}) {
  const current = editing === 'new' ? null : editing;
  const [name, setName] = useState(current?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState<string[]>(current?.models ?? []);
  const [selected, setSelected] = useState<Set<string>>(new Set(current?.models ?? []));
  const [defaultModel, setDefaultModel] = useState(current?.defaultModel ?? '');
  const [priority, setPriority] = useState(String(current?.priority ?? 0));
  const [enabled, setEnabled] = useState(current?.enabled ?? true);
  const [apiMode, setApiMode] = useState<'chat' | 'text'>(current?.apiMode ?? 'chat');
  const initialTpl = current?.textTemplate ?? '';
  const [tplId, setTplId] = useState(initialTpl.startsWith('{') ? 'custom' : (initialTpl || 'chatml'));
  const [tplJson, setTplJson] = useState(initialTpl.startsWith('{') ? initialTpl : '');
  const [filter, setFilter] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchNote, setFetchNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? models.filter((model) => model.toLowerCase().includes(q)) : models;
  }, [models, filter]);

  const selectedList = useMemo(() => [...selected].sort((a, b) => a.localeCompare(b)), [selected]);

  const fetchModels = async () => {
    setFetching(true);
    setFetchError('');
    setFetchNote('');
    try {
      const result = await api<{ models: string[] }>('/api/admin/channels/models', {
        method: 'POST',
        body: JSON.stringify({ baseUrl, apiKey, channelId: current?.id }),
      });
      const list = result.models ?? [];
      setModels(list);
      setSelected((prev) => {
        const keep = [...prev].filter((model) => list.includes(model));
        return new Set(keep.length ? keep : list);
      });
      setDefaultModel((prev) => (prev && list.includes(prev) ? prev : (list[0] ?? '')));
      setFetchNote(`获取到 ${list.length} 个模型，勾选后选默认模型。`);
    } catch (caught) {
      setFetchError((caught as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const toggleModel = (model: string) => {
    const next = new Set(selected);
    if (next.has(model)) next.delete(model);
    else next.add(model);
    setSelected(next);
    if (!next.has(defaultModel)) setDefaultModel([...next].sort((a, b) => a.localeCompare(b))[0] ?? '');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      if (!baseUrl.trim()) throw new Error('请填写 Base URL');
      if (editing === 'new' && !apiKey.trim()) throw new Error('请填写 API Key');
      if (!selectedList.length) throw new Error('请先获取并勾选至少一个模型');
      if (!defaultModel) throw new Error('请选择默认模型');
      if (apiMode === 'text' && tplId === 'custom' && !parseInstructJson(tplJson)) throw new Error('自定义模板不是有效的 ST Instruct JSON');
      const payload = {
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        models: selectedList,
        defaultModel,
        priority: Number(priority) || 0,
        enabled,
        apiMode,
        textTemplate: apiMode === 'text' ? (tplId === 'custom' ? tplJson.trim() : tplId) : '',
      };
      const result = current
        ? await api<{ channel: ChannelView }>(`/api/admin/channels/${current.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<{ channel: ChannelView }>('/api/admin/channels', { method: 'POST', body: JSON.stringify(payload) });
      onSaved(result.channel);
      onClose();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={current ? `编辑渠道 · ${current.name}` : '新建文本渠道'}
      onClose={onClose}
      footer={
        <>
          <button className="p-btn p-btn--sm" type="button" disabled={busy} onClick={onClose}>取消</button>
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存渠道'}</button>
        </>
      }
    >
      <ErrorLine message={error} />
      <div className="channel-form-grid">
        <div className="p-field"><label htmlFor="channel-name">名称</label><input id="channel-name" className="p-input" value={name} placeholder="例如：主线路 / 备用" onChange={(event) => setName(event.target.value)} /></div>
        <div className="p-field"><label htmlFor="channel-priority">优先级</label><input id="channel-priority" className="p-input" type="number" value={priority} onChange={(event) => setPriority(event.target.value)} /><span className="p-hint">数字越大越优先；同优先级按创建顺序。</span></div>
      </div>
      <div className="p-field">
        <label htmlFor="channel-base">Base URL</label>
        <input id="channel-base" className="p-input" value={baseUrl} placeholder="https://example.com/v1" onChange={(event) => setBaseUrl(event.target.value)} />
        <span className="p-hint">OpenAI 兼容地址，末尾带 /v1；模型列表会请求 <code>{baseUrl.trim().replace(/\/+$/, '') || 'https://…/v1'}/models</code>。</span>
      </div>
      <div className="p-field">
        <label htmlFor="channel-key">API Key{current ? '（留空不改）' : ''}</label>
        <input id="channel-key" className="p-input" type="password" value={apiKey} placeholder={current?.hasKey ? '已保存，留空不变' : 'sk-…'} onChange={(event) => setApiKey(event.target.value)} />
      </div>

      <div className="channel-form-grid">
        <div className="p-field">
          <label htmlFor="channel-api">接口类型</label>
          <Select id="channel-api" value={apiMode} onChange={(event) => setApiMode(event.target.value === 'text' ? 'text' : 'chat')}>
            <option value="chat">对话补全 /chat/completions</option>
            <option value="text">文本补全 /completions（ST Text Completion）</option>
          </Select>
          <span className="p-hint">本地模型 / KoboldCpp / vLLM / text-generation-webui 等走文本补全时，按 Instruct 模板拼 prompt。</span>
        </div>
        {apiMode === 'text' && (
          <div className="p-field">
            <label htmlFor="channel-tpl">Instruct 模板</label>
            <Select id="channel-tpl" value={tplId} onChange={(event) => setTplId(event.target.value)}>
              {Object.entries(INSTRUCT_PRESETS).map(([id, tpl]) => <option key={id} value={id}>{tpl.name}</option>)}
              <option value="custom">自定义（粘贴 ST 导出的 JSON）</option>
            </Select>
          </div>
        )}
      </div>
      {apiMode === 'text' && tplId === 'custom' && (
        <div className="p-field">
          <label htmlFor="channel-tpl-json">ST Instruct 模板 JSON</label>
          <textarea id="channel-tpl-json" className="p-input" rows={6} value={tplJson} placeholder='{"name":"…","input_sequence":"…","output_sequence":"…"}' onChange={(event) => setTplJson(event.target.value)} />
          <span className="p-hint">{tplJson.trim() ? (parseInstructJson(tplJson) ? `已识别：${parseInstructJson(tplJson)!.name}` : '还不是有效的模板 JSON') : 'ST 里「AI 回复格式 → Instruct 模板」导出的文件内容。'}</span>
        </div>
      )}

      <div className="channel-models-head">
        <div>
          <div className="p-form-section-title" style={{ margin: 0 }}>模型</div>
          <span className="p-hint">从上游拉取，不用手填模型名。</span>
        </div>
        <button className="p-btn p-btn--sm" type="button" disabled={fetching || !baseUrl.trim()} onClick={() => void fetchModels()}>
          {fetching ? '获取中…' : models.length ? '重新获取模型' : '获取模型'}
        </button>
      </div>
      <ErrorLine message={fetchError} />
      {fetchNote && <p className="p-hint" style={{ color: 'var(--ok, #2e7d43)' }}>{fetchNote}</p>}
      {models.length > 0 && (
        <>
          <div className="p-field" style={{ marginTop: 8 }}>
            <label htmlFor="channel-model-filter">筛选模型</label>
            <input id="channel-model-filter" className="p-input" value={filter} placeholder="输入关键词过滤" onChange={(event) => setFilter(event.target.value)} />
          </div>
          <div className="channel-models" role="group" aria-label="可选模型">
            {filtered.map((model) => (
              <label className="channel-model-row" key={model}>
                <input type="checkbox" checked={selected.has(model)} onChange={() => toggleModel(model)} />
                <code>{model}</code>
              </label>
            ))}
            {!filtered.length && <p className="p-hint" style={{ margin: '6px 0' }}>没有匹配的模型。</p>}
          </div>
          <div className="p-field" style={{ marginTop: 12 }}>
            <label htmlFor="channel-default">默认模型（生成时使用）</label>
            <Select id="channel-default" className="p-select" value={defaultModel} onChange={(event) => setDefaultModel(event.target.value)}>
              {!selectedList.length && <option value="">先勾选模型</option>}
              {selectedList.map((model) => <option key={model} value={model}>{model}</option>)}
            </Select>
          </div>
        </>
      )}

      <label className="channel-enabled">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        启用这条渠道（停用后不会参与生成）
      </label>
    </Modal>
  );
}

export function AdminChannels({ initial, others, legacy }: { initial: ChannelView[]; others: OtherGateway[]; legacy?: LegacyRoutes }) {
  const [rows, setRows] = useState(initial);
  const [editing, setEditing] = useState<ChannelView | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ChannelView | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [testing, setTesting] = useState<ChannelTestTarget | null>(null);
  const [migrating, setMigrating] = useState(false);
  const setNotice = useNotice();
  const [error, setError] = useState('');
  const [otherTesting, setOtherTesting] = useState<string | null>(null);
  const [otherResults, setOtherResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  const applySaved = (channel: ChannelView) => {
    setRows((prev) => {
      const exists = prev.some((row) => row.id === channel.id);
      const next = exists ? prev.map((row) => (row.id === channel.id ? channel : row)) : [...prev, channel];
      return next.sort((a, b) => b.priority - a.priority || a.id - b.id);
    });
    setNotice('渠道已保存。文本生成会按优先级依次尝试启用的渠道。');
  };

  const closeTest = useCallback(() => setTesting(null), []);
  // 弹窗里每测完一个模型，就把服务端写下的「上次测试」同步到这一行
  const recordTest = useCallback((channelId: number, record: ChannelTestRecord) => {
    setRows((prev) => prev.map((row) => (row.id === channelId ? { ...row, lastTestAt: Date.now(), lastTestOk: record.ok, lastTestNote: record.note } : row)));
  }, []);

  // 旧版单线路配置 → 渠道：密钥由服务端从旧配置里取，旧配置保留不删
  const migrateLegacy = async () => {
    if (!legacy?.routes.length) return;
    setMigrating(true);
    setError('');
    try {
      const created: ChannelView[] = [];
      for (const [index] of legacy.routes.entries()) {
        const result = await api<{ channel: ChannelView }>('/api/admin/channels', {
          method: 'POST',
          body: JSON.stringify({ legacyRoute: index, name: index === 0 ? '主线路（由旧配置转入）' : `备用线路 ${index}（由旧配置转入）`, priority: -index, enabled: true }),
        });
        created.push(result.channel);
      }
      setRows((prev) => [...prev, ...created].sort((a, b) => b.priority - a.priority || a.id - b.id));
      setNotice(`已把旧版单线路配置转成 ${created.length} 条渠道，文本生成改由渠道接管。`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setMigrating(false);
    }
  };

  const toggle = async (channel: ChannelView) => {
    setBusyId(channel.id);
    setError('');
    try {
      const result = await api<{ channel: ChannelView }>(`/api/admin/channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !channel.enabled }),
      });
      setRows((prev) => prev.map((row) => (row.id === channel.id ? result.channel : row)));
      setNotice(result.channel.enabled ? '渠道已启用。' : '渠道已停用，不再参与生成。');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setError('');
    try {
      await api(`/api/admin/channels/${deleting.id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((row) => row.id !== deleting.id));
      setNotice(`已删除渠道「${deleting.name}」。`);
      setDeleting(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const testOther = async (gateway: OtherGateway) => {
    setOtherTesting(gateway.name);
    setError('');
    try {
      const result = await api<{ text?: string; url?: string }>('/api/admin/settings/test', { method: 'POST', body: JSON.stringify({ kind: gateway.kind }) });
      setOtherResults((prev) => ({ ...prev, [gateway.name]: { ok: true, text: result.text || (result.url ? '已生成测试结果' : '连接成功') } }));
    } catch (caught) {
      setOtherResults((prev) => ({ ...prev, [gateway.name]: { ok: false, text: (caught as Error).message } }));
    } finally {
      setOtherTesting(null);
    }
  };

  return (
    <>
      <ErrorLine message={error} />

      <section className="p-card">
        <div className="p-block-head channel-section-head" style={{ padding: '16px 18px 12px' }}>
          <div>
            <h2 style={{ margin: 0 }}>文本渠道</h2>
            <p className="p-hint" style={{ margin: '4px 0 0' }}>按优先级从高到低依次尝试；全部失败才会报错。停用全部渠道即停止文本生成。</p>
          </div>
          <div className="channel-head-actions">
            <button className="p-btn p-btn--sm" type="button" disabled={!rows.some((row) => row.defaultModel)} onClick={() => setTesting({ kind: 'all', channels: rows })}>批量测试</button>
            <button className="p-btn p-btn--sm p-btn--primary" type="button" onClick={() => setEditing('new')}>新建渠道</button>
          </div>
        </div>
        {legacy && legacy.routes.length > 0 && !legacy.active && rows.length > 0 && (
          <p className="p-hint channel-legacy-hint">另有一套旧版「单线路配置」（环境变量 TAVERN_MODEL_* 或旧设置），只在一条渠道都没有时才会启用，现在不生效。</p>
        )}

        {rows.length === 0 && legacy?.active ? (
          <div className="p-notice channel-legacy" style={{ margin: 16 }}>
            <div className="p-notice-main">
              <div className="p-notice-title">现在用的是旧版「单线路配置」</div>
              <code>{legacy.routes[0].model}</code> · {legacy.routes[0].baseUrl}{legacy.routes.length > 1 ? `，另有 ${legacy.routes.length - 1} 条备用线路` : ''}。它来自环境变量 TAVERN_MODEL_* 或旧版后台设置，只在一条渠道都没有时生效。转成渠道后就能在这里统一测试、排优先级、拉模型列表；旧配置保留不删，删掉全部渠道会自动回到它。
            </div>
            <div className="admin-actions">
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={migrating} onClick={() => void migrateLegacy()}>{migrating ? '转换中…' : '转为渠道'}</button>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setEditing('new')}>新建渠道</button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-empty" style={{ margin: 16 }}>
            <div className="p-empty-title">还没有文本渠道</div>
            <p className="p-empty-text">新建一条渠道并获取模型；创建后文本生成只走启用的渠道。</p>
            <button className="p-btn p-btn--primary" type="button" onClick={() => setEditing('new')}>新建渠道</button>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table channel-table">
              <thead><tr><th>渠道</th><th>地址</th><th>模型</th><th>优先级</th><th>状态</th><th className="admin-col-actions">操作</th></tr></thead>
              <tbody>
                {rows.map((channel) => {
                  return (
                    <tr key={channel.id}>
                      <td data-label="渠道"><strong>{channel.name}</strong>{!channel.hasKey && <span className="p-pill p-pill--sm p-pill--warn" style={{ marginLeft: 6 }}>缺密钥</span>}</td>
                      <td data-label="地址" className="small">{channel.baseUrl}</td>
                      <td data-label="模型" className="small">
                        {channel.defaultModel || '—'}
                        <span style={{ display: 'block', color: 'var(--muted)' }}>{channel.models.length} 个可选</span>
                        {channel.lastTestNote && (
                          <span className="channel-last-test" data-ok={channel.lastTestOk ? '1' : '0'} style={{ display: 'block', marginTop: 4, color: channel.lastTestOk ? 'var(--ok, #2e7d43)' : 'var(--danger)' }}>
                            {`${channel.lastTestOk ? '上次成功' : '上次失败'}：${channel.lastTestNote}`}
                          </span>
                        )}
                      </td>
                      <td data-label="优先级">{channel.priority}</td>
                      <td data-label="状态">
                        <span className={`p-pill p-pill--sm ${channel.enabled ? 'p-pill--ok' : 'p-pill--outline'}`}>{channel.enabled ? '启用' : '停用'}</span>
                        <span style={{ display: 'block', marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>{channel.lastTestAt ? <LocalTime value={channel.lastTestAt} style="date" render={relative} /> : relative(null)}</span>
                      </td>
                      <td data-label="操作" className="admin-col-actions">
                        <div className="admin-actions">
                          <button className="p-btn p-btn--sm" type="button" disabled={busyId === channel.id || !channel.hasKey} onClick={() => setTesting({ kind: 'channel', channel })}>测试</button>
                          <button className="p-btn p-btn--sm" type="button" disabled={busyId === channel.id} onClick={() => setEditing(channel)}>编辑</button>
                          <button className="p-btn p-btn--sm" type="button" disabled={busyId === channel.id} onClick={() => void toggle(channel)}>{channel.enabled ? '停用' : '启用'}</button>
                          <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === channel.id} onClick={() => setDeleting(channel)}>删除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="p-card" style={{ marginTop: 16 }}>
        <div className="p-block-head channel-section-head" style={{ padding: '16px 18px 12px' }}>
          <div>
            <h2 style={{ margin: 0 }}>其他网关</h2>
            <p className="p-hint" style={{ margin: '4px 0 0' }}>生图、语音、邮件在「扩展能力」里维护，支付在「计费与增长」。</p>
          </div>
          <Link className="p-btn p-btn--sm" href="/admin/settings/image">生图与语音</Link>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>渠道</th><th>地址 / 提供方</th><th>模型 / 说明</th><th>状态</th><th className="admin-col-actions">操作</th></tr></thead>
            <tbody>
              {others.map((gateway) => {
                const result = otherResults[gateway.name];
                return (
                  <tr key={gateway.name}>
                    <td data-label="渠道"><strong>{gateway.name}</strong></td>
                    <td data-label="地址 / 提供方">{gateway.endpoint}</td>
                    <td data-label="模型 / 说明" className="small">
                      {gateway.model || '—'}
                      {result && <span style={{ display: 'block', marginTop: 4, color: result.ok ? 'var(--ok, #2e7d43)' : 'var(--danger)' }}>{result.ok ? `测试成功：${result.text}` : result.text}</span>}
                    </td>
                    <td data-label="状态"><span className={`p-pill p-pill--sm ${gateway.ok ? 'p-pill--ok' : 'p-pill--warn'}`}>{gateway.ok ? '已连接' : '未配置'}</span></td>
                    <td data-label="操作" className="admin-col-actions">
                      <div className="admin-actions">
                        <Link className="p-btn p-btn--sm" href={gateway.href}>配置</Link>
                        {gateway.kind !== 'payment' && gateway.kind !== 'mail' && (
                          <button className="p-btn p-btn--sm" type="button" disabled={otherTesting === gateway.name || !gateway.ok} onClick={() => void testOther(gateway)}>
                            {otherTesting === gateway.name ? '测试中…' : '测试'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {testing && <ChannelTestModal target={testing} onClose={closeTest} onRecord={recordTest} />}

      {editing && <ChannelForm editing={editing} onClose={() => setEditing(null)} onSaved={applySaved} />}

      {deleting && (
        <Modal
          title="删除渠道"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" disabled={busyId === deleting.id} onClick={() => setDeleting(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busyId === deleting.id} onClick={() => void remove()}>{busyId === deleting.id ? '删除中…' : '确认删除'}</button>
            </>
          }
        >
          <p style={{ margin: 0 }}>确定删除「{deleting.name}」？删除后这条线路立即停止参与生成，密钥也会一并删除。</p>
        </Modal>
      )}
    </>
  );
}
