'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, api } from '@/components/settings-ui';

// 渠道测试弹窗：单渠道（从上游拉全部模型，可多选）或全部渠道（各自的默认模型）。
// 每个模型单独打一次 POST /api/admin/channels/[id]/test，前端限并发；取消即中止进行中的请求（服务端随之中止上游请求）。
// 测试直连上游、不计费，结果同步写回渠道的「上次测试」记录。

export type TestChannel = { id: number; name: string; models: string[]; defaultModel: string; enabled: boolean; hasKey: boolean };
export type ChannelTestTarget = { kind: 'channel'; channel: TestChannel } | { kind: 'all'; channels: TestChannel[] };
export type ChannelTestRecord = { ok: boolean; note: string };

const DEFAULT_PROMPT = '只回复两个字母：ok';
const CONCURRENCY = 3;

type Item = { key: string; channelId: number; channelName: string; model: string; isDefault: boolean };
type Status =
  | { state: 'wait' }
  | { state: 'run' }
  | { state: 'ok'; ms: number; text: string }
  | { state: 'fail'; ms: number; error: string; status: number }
  | { state: 'cancel' };

function itemsFor(target: ChannelTestTarget, upstream: string[] | null): Item[] {
  if (target.kind === 'all') {
    return target.channels
      .filter((channel) => channel.defaultModel)
      .map((channel) => ({ key: `${channel.id}|${channel.defaultModel}`, channelId: channel.id, channelName: channel.name, model: channel.defaultModel, isDefault: true }));
  }
  const { channel } = target;
  const list = [...new Set([...(upstream ?? channel.models), ...(channel.defaultModel ? [channel.defaultModel] : [])])];
  // 默认模型排最前，其余按名字
  list.sort((a, b) => Number(b === channel.defaultModel) - Number(a === channel.defaultModel) || a.localeCompare(b));
  return list.map((model) => ({ key: `${channel.id}|${model}`, channelId: channel.id, channelName: channel.name, model, isDefault: model === channel.defaultModel }));
}

function StatusCell({ status }: { status?: Status }) {
  if (!status) return <span className="ctest-status is-idle">—</span>;
  if (status.state === 'wait') return <span className="ctest-status is-wait">等待</span>;
  if (status.state === 'run') return <span className="ctest-status is-run"><span className="ctest-spin" aria-hidden="true" />进行中</span>;
  if (status.state === 'cancel') return <span className="ctest-status is-wait">已取消</span>;
  if (status.state === 'ok') {
    return (
      <span className="ctest-status is-ok">
        <span>成功 · {status.ms}ms</span>
        <span className="ctest-snippet" title={status.text}>{status.text}</span>
      </span>
    );
  }
  return (
    <span className="ctest-status is-fail">
      <span>失败{status.status ? ` · HTTP ${status.status}` : ''}</span>
      <span className="ctest-snippet" title={status.error}>{status.error}</span>
    </span>
  );
}

export function ChannelTestModal({
  target,
  onClose,
  onRecord,
}: {
  target: ChannelTestTarget;
  onClose: () => void;
  onRecord: (channelId: number, record: ChannelTestRecord) => void;
}) {
  const single = target.kind === 'channel' ? target.channel : null;
  const [upstream, setUpstream] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(Boolean(single));
  const [loadNote, setLoadNote] = useState('');
  const items = useMemo(() => itemsFor(target, upstream), [target, upstream]);
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (target.kind === 'all') return new Set(target.channels.filter((channel) => channel.enabled && channel.defaultModel && channel.hasKey).map((channel) => `${channel.id}|${channel.defaultModel}`));
    return new Set(target.channel.defaultModel ? [`${target.channel.id}|${target.channel.defaultModel}`] : []);
  });
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [filter, setFilter] = useState('');
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const onRecordRef = useRef(onRecord);
  onRecordRef.current = onRecord;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  // 单渠道：打开即从上游拉全部模型；拉不到就用渠道里已保存的模型列表
  useEffect(() => {
    if (!single) return;
    let alive = true;
    api<{ models: string[] }>('/api/admin/channels/models', { method: 'POST', body: JSON.stringify({ channelId: single.id }) })
      .then((result) => { if (alive) { setUpstream(result.models ?? []); setLoadNote(`上游共有 ${result.models?.length ?? 0} 个模型。`); } })
      .catch((caught: Error) => { if (alive) setLoadNote(`没拉到上游模型列表（${caught.message}），先列出渠道里已保存的模型。`); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [single]);

  // 关掉弹窗（含 Esc）时中止进行中的测试
  useEffect(() => () => controller.current?.abort(), []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? items.filter((item) => item.model.toLowerCase().includes(q) || item.channelName.toLowerCase().includes(q)) : items;
  }, [items, filter]);
  const chosen = items.filter((item) => selected.has(item.key));
  const visibleChosen = visible.filter((item) => selected.has(item.key)).length;
  const allVisible = visible.length > 0 && visibleChosen === visible.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = visibleChosen > 0 && !allVisible;
  }, [visibleChosen, allVisible]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of visible) {
        if (allVisible) next.delete(item.key);
        else next.add(item.key);
      }
      return next;
    });
  };

  const set = (key: string, status: Status) => setStatuses((prev) => ({ ...prev, [key]: status }));

  const runOne = async (item: Item, signal: AbortSignal) => {
    set(item.key, { state: 'run' });
    const started = Date.now();
    try {
      const response = await fetch(`/api/admin/channels/${item.channelId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: item.model, prompt }),
        signal,
      });
      const data = (await response.json().catch(() => ({}))) as { text?: string; ms?: number; message?: string; upstreamStatus?: number; note?: string };
      if (response.ok) {
        set(item.key, { state: 'ok', ms: data.ms ?? Date.now() - started, text: data.text || '（模型没有返回正文）' });
        onRecordRef.current(item.channelId, { ok: true, note: data.note ?? `${data.text ?? ''} · ${data.ms ?? 0}ms` });
      } else {
        const error = data.message || `请求失败（${response.status}）`;
        set(item.key, { state: 'fail', ms: data.ms ?? Date.now() - started, error, status: data.upstreamStatus || response.status });
        if (response.status === 502) onRecordRef.current(item.channelId, { ok: false, note: data.note ?? error });
      }
    } catch (caught) {
      if (signal.aborted) set(item.key, { state: 'cancel' });
      else set(item.key, { state: 'fail', ms: Date.now() - started, error: (caught as Error).message || '网络错误', status: 0 });
    }
  };

  const start = async () => {
    const queue = items.filter((item) => selected.has(item.key));
    if (!queue.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setFinished(false);
    setStatuses(Object.fromEntries(queue.map((item) => [item.key, { state: 'wait' } as Status])));
    let next = 0;
    const worker = async () => {
      while (!abort.signal.aborted && next < queue.length) {
        const item = queue[next++];
        await runOne(item, abort.signal);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (abort.signal.aborted) {
      setStatuses((prev) => Object.fromEntries(Object.entries(prev).map(([key, status]) => [key, status.state === 'wait' || status.state === 'run' ? { state: 'cancel' } : status])));
    }
    if (controller.current === abort) controller.current = null;
    setRunning(false);
    setFinished(true);
  };

  const cancel = () => controller.current?.abort();

  const summary = useMemo(() => {
    const list = Object.values(statuses);
    const ok = list.filter((status): status is Extract<Status, { state: 'ok' }> => status.state === 'ok');
    const failed = list.filter((status) => status.state === 'fail').length;
    const cancelled = list.filter((status) => status.state === 'cancel').length;
    const done = ok.length + failed;
    const avg = ok.length ? Math.round(ok.reduce((sum, status) => sum + status.ms, 0) / ok.length) : 0;
    return { ok: ok.length, failed, cancelled, done, total: list.length, avg };
  }, [statuses]);

  const title = single ? `测试渠道 · ${single.name}` : '批量测试 · 各渠道默认模型';

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {running ? (
            <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={cancel}>取消测试</button>
          ) : (
            <button className="p-btn p-btn--sm" type="button" onClick={onClose}>关闭</button>
          )}
          <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={running || loading || !chosen.length} onClick={() => void start()}>
            {running ? `测试中 ${summary.done}/${summary.total}` : `开始测试（${chosen.length}）`}
          </button>
        </>
      }
    >
      <div className="ctest" data-testid="channel-test">
        <p className="p-hint" style={{ margin: '0 0 12px' }}>
          {single
            ? '勾选要测的模型（可多选），每个模型单独发一次请求。'
            : '每条渠道测它的默认模型（生成时用的那个）；默认勾选启用中的渠道。'}
          最多同时测 {CONCURRENCY} 个；直连上游，不计费、不扣任何人的点数。
        </p>
        <div className="p-field">
          <label htmlFor="ctest-prompt">测试内容</label>
          <textarea id="ctest-prompt" className="p-input" rows={2} maxLength={500} value={prompt} disabled={running} onChange={(event) => setPrompt(event.target.value)} />
          <span className="p-hint">发给模型的一句话，回复最多 16 个 token。</span>
        </div>

        {loading ? (
          <p className="p-hint" role="status">正在从上游拉取模型列表…</p>
        ) : (
          <>
            {loadNote && <p className="p-hint" style={{ margin: '4px 0 8px' }}>{loadNote}</p>}
            {items.length > 8 && (
              <div className="p-field" style={{ marginBottom: 8 }}>
                <label htmlFor="ctest-filter">筛选模型</label>
                <input id="ctest-filter" className="p-input" value={filter} placeholder="输入关键词过滤" onChange={(event) => setFilter(event.target.value)} />
              </div>
            )}
            <div className="ctest-head">
              <label className="ctest-check">
                <input ref={selectAllRef} type="checkbox" aria-label="全选" checked={allVisible} disabled={running || !visible.length} onChange={toggleAll} />
                <span>全选{filter.trim() ? '（筛选结果）' : ''}</span>
              </label>
              <span className="p-hint" style={{ margin: 0 }}>已选 {chosen.length} / {items.length}</span>
            </div>
            <div className="ctest-list" role="group" aria-label="要测试的模型">
              {visible.map((item) => (
                <div className="ctest-row" key={item.key} data-model={item.model} data-state={statuses[item.key]?.state ?? 'idle'}>
                  <label className="ctest-check ctest-name">
                    <input type="checkbox" checked={selected.has(item.key)} disabled={running} onChange={() => toggle(item.key)} />
                    <span>
                      {!single && <strong className="ctest-channel">{item.channelName}</strong>}
                      <code>{item.model}</code>
                      {single && item.isDefault && <span className="p-pill p-pill--sm p-pill--outline" style={{ marginLeft: 6 }}>默认</span>}
                    </span>
                  </label>
                  <StatusCell status={statuses[item.key]} />
                </div>
              ))}
              {!visible.length && <p className="p-hint" style={{ margin: '8px 0' }}>{items.length ? '没有匹配的模型。' : '没有可测试的模型。'}</p>}
            </div>
          </>
        )}

        <div className="ctest-summary" role="status" aria-live="polite">
          {running && <span>进行中：已完成 {summary.done} / {summary.total}</span>}
          {!running && finished && (
            <span data-testid="channel-test-summary">
              测试结束：成功 <strong>{summary.ok}</strong> 个 · 失败 <strong>{summary.failed}</strong> 个
              {summary.cancelled ? <> · 取消 <strong>{summary.cancelled}</strong> 个</> : null}
              {' · '}平均耗时 {summary.ok ? `${summary.avg}ms` : '—'}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
