'use client';

import { LocalTime } from '@/components/local-time';
import { useCallback, useEffect, useState } from 'react';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { usePlayMode } from '@/components/play-mode';
import { PARAM_FIELDS } from '@/lib/param-fields';
import type { PresetParams } from '@/lib/resources';

type SettingsData = {
  settings: { presetId: number | null; personaId: number | null; lorebookIds: number[] | null };
  presets: { id: number; name: string; params?: PresetParams }[];
  personas: { id: number; name: string; boundCharacters: string[] }[];
  lorebooks: { id: number; name: string; count: number }[];
  cardLore?: CardLoreItem[];
  context?: { window: number; modelLimit: number; cap: number };
};

type Preview = {
  preset: { id: number; name: string; params: Record<string, number>; instruct: { enabled: boolean } };
  persona: { id: number; name: string } | null;
  blocks: { key: string; label: string; text: string; chars: number; enabled: boolean }[];
  messages: { role: string; content: string }[];
  tokens: number;
  chars: number;
  dropped: number;
  loreHits: { title: string; keys: string[] }[];
  context?: { window: number; modelLimit: number; requested: number; history: number };
};

type MemoryData = {
  status: { enabled: boolean; interval: number; covered: number; behind: number; text: string; source: string; updatedAt: number };
  rag: { enabled: boolean; topK: number };
  memory: string;
  messageCount: number;
  recentWindow: number;
};

type Backup = { id: number; message_count: number; created_at: number };

type Tab = 'gen' | 'memory' | 'backup';

const TABS: [Tab, string][] = [
  ['gen', '生成'],
  ['memory', '记忆'],
  ['backup', '备份与导出'],
];

const fmtK = (tokens: number) => (tokens >= 1_000_000 ? `${+(tokens / 1_000_000).toFixed(2)}M` : `${Math.round(tokens / 1000)}K`);


type CardLoreItem = { id: string; title: string; preview: string; trigger: 'constant' | 'keyword'; keywords: string[]; defaultOn: boolean; on: boolean };

export function ChatSettings({ chatId }: { chatId: number }) {
  const mode = usePlayMode();
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<PresetParams | null>(null);
  const [paramsDirty, setParamsDirty] = useState(false);
  const [tab, setTab] = useState<Tab>('gen');
  const [data, setData] = useState<SettingsData | null>(null);
  const [presetId, setPresetId] = useState<number | null>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [allBooks, setAllBooks] = useState(true);
  const [bookIds, setBookIds] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [summaryEnabled, setSummaryEnabled] = useState(true);
  const [summaryInterval, setSummaryInterval] = useState(12);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [ragTopK, setRagTopK] = useState(3);
  const [manualMemory, setManualMemory] = useState('');
  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cardLoreBusy, setCardLoreBusy] = useState(false);

  // 卡内世界书开关即时保存（和预设/世界书的「保存」按钮分开）
  const saveCardLore = async (next: CardLoreItem[] | null) => {
    if (!data?.cardLore) return;
    const list = next ?? data.cardLore.map((item) => ({ ...item, on: item.defaultOn }));
    setData((prev) => (prev ? { ...prev, cardLore: list } : prev));
    setCardLoreBusy(true);
    setError('');
    try {
      await api(`/api/chats/${chatId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ cardLore: next ? Object.fromEntries(list.map((item) => [item.id, item.on])) : null }),
      });
      flashSaved();
    } catch (caught) {
      setError((caught as Error).message);
      void load();
    } finally {
      setCardLoreBusy(false);
    }
  };

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api<SettingsData>(`/api/chats/${chatId}/settings`);
      setData(result);
      const pid = result.settings.presetId ?? result.presets[0]?.id ?? null;
      setPresetId(pid);
      setParams(result.presets.find((preset) => preset.id === pid)?.params ?? null);
      setParamsDirty(false);
      setPersonaId(result.settings.personaId);
      setAllBooks(result.settings.lorebookIds === null);
      setBookIds(result.settings.lorebookIds ?? []);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [chatId]);

  const loadMemory = useCallback(async () => {
    setError('');
    try {
      const result = await api<MemoryData>(`/api/chats/${chatId}/memory`);
      setMemory(result);
      setSummaryText(result.status.text);
      setSummaryEnabled(result.status.enabled);
      setSummaryInterval(result.status.interval);
      setRagEnabled(result.rag.enabled);
      setRagTopK(result.rag.topK);
      setManualMemory(result.memory);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [chatId]);

  const loadBackups = useCallback(async () => {
    setError('');
    try {
      const result = await api<{ backups: Backup[] }>(`/api/chats/${chatId}/backups`);
      setBackups(result.backups);
    } catch (caught) {
      setError((caught as Error).message);
    }
  }, [chatId]);

  useEffect(() => {
    if (!open) return;
    if (tab === 'gen') void load();
    if (tab === 'memory') void loadMemory();
    if (tab === 'backup') void loadBackups();
  }, [open, tab, load, loadMemory, loadBackups]);

  const flashSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const saveSettings = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/chats/${chatId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({ presetId, personaId, lorebookIds: allBooks ? null : bookIds }),
      });
      // 老玩家在对话里直接调的采样参数写回当前预设（与 ST 一样，参数跟着预设走）
      if (paramsDirty && params && presetId) {
        await api(`/api/presets/${presetId}`, { method: 'PATCH', body: JSON.stringify({ params }) });
        setData((prev) => prev ? { ...prev, presets: prev.presets.map((preset) => (preset.id === presetId ? { ...preset, params } : preset)) } : prev);
        setParamsDirty(false);
      }
      flashSaved();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveMemory = async (refresh = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await api<MemoryData>(`/api/chats/${chatId}/memory`, {
        method: 'PATCH',
        body: JSON.stringify({
          summaryEnabled,
          summaryInterval,
          summaryText,
          ragEnabled,
          ragTopK,
          memory: manualMemory,
          refresh,
        }),
      });
      setMemory(result);
      setSummaryText(result.status.text);
      flashSaved();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setError('');
    try {
      setPreview(await api<Preview>(`/api/chats/${chatId}/context-preview`));
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const makeBackup = async () => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/chats/${chatId}/backups`, { method: 'POST' });
      await loadBackups();
      flashSaved();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: number) => {
    setBusy(true);
    setError('');
    try {
      await api(`/api/chats/${chatId}/backups/${id}/restore`, { method: 'POST' });
      setConfirmRestore(null);
      window.location.reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="btn btn--sm" type="button" onClick={() => setOpen(true)}>设定</button>
      {open && (
        <Modal
          title="这个故事怎么生成"
          onClose={() => setOpen(false)}
          footer={
            <>
              {tab === 'gen' && mode !== 'newbie' && <button className="btn btn--sm" type="button" onClick={() => void runPreview()}>预览上下文</button>}
              {tab === 'memory' && <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void saveMemory(true)}>刷新摘要</button>}
              {tab === 'backup' && <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void makeBackup()}>现在留一份</button>}
              {tab !== 'backup' && (
                <button
                  className="btn btn--sm btn--primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void (tab === 'gen' ? saveSettings() : saveMemory(false))}
                >
                  {saved ? '已保存' : busy ? '保存中…' : '保存'}
                </button>
              )}
            </>
          }
        >
          <div className="p-tabs" style={{ margin: '0 0 16px' }} role="tablist">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setError(''); }}>
                {label}
              </button>
            ))}
          </div>
          <ErrorLine message={error} />

          {tab === 'gen' && (
            !data ? (
              <SettingsSkeleton />
            ) : (
              <>
                {mode === 'newbie' && <p className="p-hint" style={{ margin: '0 0 12px' }}>选一个「身份」，角色就知道你是谁。预设、世界书这些进阶设置在老玩家模式里（外观 → 玩法模式）。</p>}
                <div className="field-row">
                  {mode !== 'newbie' && (
                  <div className="field">
                    <label>预设 <small className="pm-st">Preset</small></label>
                    <select className="select" value={presetId ?? ''} onChange={(event) => {
                      const next = event.target.value ? Number(event.target.value) : null;
                      setPresetId(next);
                      setParams(data.presets.find((preset) => preset.id === next)?.params ?? null);
                      setParamsDirty(false);
                    }}>
                      {data.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                    </select>
                  </div>
                  )}
                  <div className="field">
                    <label>身份</label>
                    <select className="select" value={personaId ?? ''} onChange={(event) => setPersonaId(event.target.value ? Number(event.target.value) : null)}>
                      <option value="">不使用身份</option>
                      {data.personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
                    </select>
                  </div>
                </div>

                {mode !== 'newbie' && params && (
                  <div className="field cs-params">
                    <label>采样参数 <small className="pm-st">{mode === 'full' ? '全部 · 保存时写回当前预设' : '常用 · 完整参数在「预设」或酒馆全功能模式'}</small></label>
                    <div className="cs-param-grid">
                      {PARAM_FIELDS.filter((field) => mode === 'full' || field.core).map(({ key, label, min, max, step, help }) => (
                        <label className="cs-param" key={key} title={help}>
                          <span>{label}</span>
                          <input className="p-input" type="number" min={min} max={max} step={step} value={params[key]}
                            onChange={(event) => { setParams({ ...params, [key]: Number(event.target.value) }); setParamsDirty(true); }} />
                        </label>
                      ))}
                    </div>
                    {data.context && (
                      <small className="cs-ctx-hint">
                        context_size 填 0 跟随模型：{data.context.modelLimit ? `当前模型上限 ${fmtK(data.context.modelLimit)}` : `当前模型没标上限，按默认 ${fmtK(data.context.window)}`}
                        {data.context.cap ? `，全站封顶 ${fmtK(data.context.cap)}` : ''}。填得越大能记住越多，单次消耗也越高。
                        {params.contextSize > 0 && params.contextSize > (data.context.cap || data.context.modelLimit || data.context.window) ? ` 你填的超过上限，按 ${fmtK(Math.min(data.context.cap || Infinity, data.context.modelLimit || data.context.window))} 算。` : ''}
                      </small>
                    )}
                  </div>
                )}

                {mode !== 'newbie' && (
                <div className="field">
                  <label>世界书 <small className="pm-st">World Info</small></label>
                  <label className="check" style={{ marginBottom: 8 }}>
                    <input type="checkbox" checked={allBooks} onChange={(event) => setAllBooks(event.target.checked)} />
                    <span>使用全部世界书（新加的书自动生效）</span>
                  </label>
                  {!allBooks && (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {data.lorebooks.map((book) => (
                        <label className="check" key={book.id}>
                          <input
                            type="checkbox"
                            checked={bookIds.includes(book.id)}
                            onChange={(event) => setBookIds((prev) => (event.target.checked ? [...prev, book.id] : prev.filter((id) => id !== book.id)))}
                          />
                          <span>{book.name}（{book.count} 条）</span>
                        </label>
                      ))}
                      {!data.lorebooks.length && <span className="hint">还没有世界书。</span>}
                    </div>
                  )}
                </div>
                )}

                {!!data.cardLore?.length && (
                  <div className="field cs-cardlore">
                    <label>卡内世界书 <small className="pm-st">Character Lore</small></label>
                    <small className="hint">角色卡自带的条目，只对这个会话生效。卡作者常把插图、状态栏样式做成开关让你自己选。</small>
                    <details className="cs-cardlore-box">
                      <summary>
                        已开 {data.cardLore.filter((item) => item.on).length} / {data.cardLore.length} 条
                        {data.cardLore.some((item) => item.on !== item.defaultOn) ? ' · 改过' : ''}
                      </summary>
                      {data.cardLore.some((item) => item.on !== item.defaultOn) && (
                        <button type="button" className="btn btn--sm btn--ghost cs-cardlore-reset" disabled={cardLoreBusy} onClick={() => void saveCardLore(null)}>恢复卡默认</button>
                      )}
                      <div className="cs-cardlore-list">
                        {data.cardLore.map((item) => (
                          <label className="check cs-cardlore-item" key={item.id} title={item.preview}>
                            <input
                              type="checkbox"
                              checked={item.on}
                              disabled={cardLoreBusy}
                              onChange={(event) => void saveCardLore(data.cardLore!.map((entry) => (entry.id === item.id ? { ...entry, on: event.target.checked } : entry)))}
                            />
                            <span className="cs-cardlore-text">
                              <span className="cs-cardlore-title">{item.title}</span>
                              <small className="cs-cardlore-meta">
                                {item.trigger === 'constant' ? '常驻' : item.keywords.length ? `关键词：${item.keywords.join('、')}` : '关键词触发'}
                                {item.on !== item.defaultOn ? (item.defaultOn ? ' · 卡默认开' : ' · 卡默认关') : ''}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                {preview && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <p className="small" style={{ marginTop: 0 }}>
                      约 {preview.tokens} tokens · {preview.chars} 字符{preview.context ? ` · 窗口 ${fmtK(preview.context.window)}${preview.context.requested ? '（预设设定）' : '（跟随模型）'}` : ''} · 历史丢弃 {preview.dropped} 条
                      {preview.persona ? ` · 身份 ${preview.persona.name}` : ''}
                    </p>
                    <p className="small" style={{ margin: '0 0 8px' }}>
                      世界书命中：{preview.loreHits.length ? preview.loreHits.map((hit) => `${hit.title}（${hit.keys.join('、')}）`).join('；') : '无'}
                    </p>
                    {preview.blocks.filter((block) => block.enabled && block.text).map((block) => (
                      <details className="preview-block" key={block.key}>
                        <summary className="preview-block-head">{block.label} · {block.chars} 字符</summary>
                        <pre>{block.text}</pre>
                      </details>
                    ))}
                    <details className="preview-block">
                      <summary className="preview-block-head">最终消息 · {preview.messages.length} 条</summary>
                      <pre>{preview.messages.map((message) => `[${message.role}]\n${message.content}`).join('\n\n')}</pre>
                    </details>
                  </div>
                )}
              </>
            )
          )}

          {tab === 'memory' && (
            !memory ? (
              <SettingsSkeleton />
            ) : (
              <>
                <MemoryMap data={memory} ragOn={ragEnabled} manual={manualMemory.trim().length > 0} />
                <h3 className="panel-title">自动摘要</h3>
                <p className="small" style={{ marginTop: 0 }}>
                  已覆盖 {memory.status.covered} 条 · 落后 {memory.status.behind} 条 · 最近 {memory.recentWindow} 条始终按原文进入上下文
                  {memory.status.source === 'manual' ? ' · 当前是手改版本' : ''}
                </p>
                <label className="check" style={{ marginBottom: 10 }}>
                  <input type="checkbox" checked={summaryEnabled} onChange={(event) => setSummaryEnabled(event.target.checked)} />
                  <span>启用自动摘要</span>
                </label>
                <div className="field-row">
                  <div className="field">
                    <label>每多少条更新一次</label>
                    <input className="input" type="number" min={4} max={40} value={summaryInterval} onChange={(event) => setSummaryInterval(Number(event.target.value))} />
                  </div>
                </div>
                <div className="field">
                  <label>摘要文本（可手改，改后标记为手改版本）</label>
                  <textarea className="textarea" rows={6} value={summaryText} onChange={(event) => setSummaryText(event.target.value)} />
                </div>

                <h3 className="panel-title" style={{ marginTop: 8 }}>记忆检索</h3>
                <p className="small" style={{ marginTop: 0 }}>按当前输入从更早的对话里挑相关片段（字符 bigram 近似，不调用 embedding）。</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', marginBottom: 16 }}>
                  <label className="check">
                    <input type="checkbox" checked={ragEnabled} onChange={(event) => setRagEnabled(event.target.checked)} />
                    <span>启用检索</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
                    返回片段数
                    <input className="input" style={{ width: 80 }} type="number" min={1} max={5} value={ragTopK} onChange={(event) => setRagTopK(Number(event.target.value))} />
                  </label>
                </div>

                <h3 className="panel-title" style={{ marginTop: 8 }}>手动记忆</h3>
                <div className="field">
                  <label>剧情要点（每轮都会进入上下文）</label>
                  <textarea className="textarea" rows={4} value={manualMemory} placeholder="例如：玩家把伞借给了沈砚之；两人约好明晚在报馆后门见。" onChange={(event) => setManualMemory(event.target.value)} />
                </div>
              </>
            )
          )}

          {tab === 'backup' && (
            <>
              <p className="small" style={{ marginTop: 0 }}>每次对话结束会自动留一份快照，最近保留 5 份；恢复前会先给当前状态留一份，恢复本身也能撤销。</p>
              {!backups ? (
                <SettingsSkeleton />
              ) : (
                <div className="res-list">
                  {backups.map((backup) => (
                    <div className="res-row" key={backup.id} style={{ padding: '10px 12px' }}>
                      <div className="res-row-main">
                        <div className="res-row-title" style={{ fontSize: 13.5 }}><LocalTime value={backup.created_at} style="mdhm" /></div>
                        <div className="res-row-sub">{backup.message_count} 条消息</div>
                      </div>
                      <div className="res-actions">
                        {confirmRestore === backup.id ? (
                          <>
                            <button className="btn btn--sm btn--danger" type="button" disabled={busy} onClick={() => void restore(backup.id)}>确认恢复</button>
                            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setConfirmRestore(null)}>取消</button>
                          </>
                        ) : (
                          <button className="btn btn--sm" type="button" onClick={() => setConfirmRestore(backup.id)}>恢复</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!backups.length && <p className="small">还没有快照。发一条消息或点「现在留一份」。</p>}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <a className="btn btn--sm" href={`/api/chats/${chatId}/export?format=txt`} download>导出 txt</a>
                <a className="btn btn--sm" href={`/api/chats/${chatId}/export?format=jsonl`} download>导出 jsonl</a>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

// 记忆示意：一条横轴 = 整段对话。左边已被摘要「压缩」，中间只能靠检索捞回，右边最近 N 条原文直送模型。
/** 设置面板加载占位：和最终表单同形（标签 + 输入框两列，再一块文本区），避免只显示「加载中…」。 */
function SettingsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="cs-skel" role="status" aria-label="加载中">
      {Array.from({ length: rows }, (_, i) => (
        <div className="cs-skel-row" key={i}>
          <div><span className="p-skeleton cs-skel-label" /><span className="p-skeleton cs-skel-input" /></div>
          <div><span className="p-skeleton cs-skel-label" /><span className="p-skeleton cs-skel-input" /></div>
        </div>
      ))}
      <span className="p-skeleton cs-skel-label" />
      <span className="p-skeleton cs-skel-area" />
    </div>
  );
}

function MemoryMap({ data, ragOn, manual }: { data: MemoryData; ragOn: boolean; manual: boolean }) {
  const total = Math.max(1, data.messageCount);
  const recent = Math.min(data.recentWindow, data.messageCount);
  const covered = Math.min(data.status.covered, Math.max(0, data.messageCount - recent));
  const gap = Math.max(0, data.messageCount - recent - covered);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const segs = [
    { key: 'sum', n: covered, label: '摘要', note: data.status.enabled ? `前 ${covered} 条已压缩成摘要` : '自动摘要已关闭' },
    { key: 'gap', n: gap, label: ragOn ? '检索' : '未覆盖', note: ragOn ? `${gap} 条按相关度检索带回` : `${gap} 条暂时不会进入上下文` },
    { key: 'recent', n: recent, label: '原文', note: `最近 ${recent} 条按原文发送` },
  ];
  return (
    <div className="mm" aria-label="记忆覆盖示意">
      <div className="mm-head"><b>这段故事的记忆</b><span>共 {data.messageCount} 条</span></div>
      <div className="mm-bar" role="img" aria-label={segs.map((seg) => seg.note).join('，')}>
        {segs.map((seg) => seg.n > 0 && <i key={seg.key} className={`mm-${seg.key}${seg.key === 'gap' && !ragOn ? ' is-off' : ''}`} style={{ width: pct(seg.n) }} title={seg.note} />)}
      </div>
      <ul className="mm-legend">
        {segs.map((seg) => <li key={seg.key}><span className={`mm-dot mm-${seg.key}${seg.key === 'gap' && !ragOn ? ' is-off' : ''}`} />{seg.note}</li>)}
        <li><span className={`mm-dot mm-pin${manual ? '' : ' is-off'}`} />{manual ? '手动记忆每轮都带上' : '还没写手动记忆'}</li>
      </ul>
    </div>
  );
}
