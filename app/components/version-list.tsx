'use client';

import { useEffect, useState } from 'react';
import { ErrorLine, api } from '@/components/settings-ui';
import { tr } from '@/lib/i18n/runtime';

type Snapshot = Record<string, unknown> & { name?: string; hook?: string; greeting?: string; description?: string };
type Version = { id: number; revision: number; createdAt: number; snapshot: Snapshot };

// 比较时用到的字段与显示名；card 是 ST 高级字段，逐项比较
const FIELDS: [string, string][] = [
  ['name', '名字'], ['hook', '一句话简介'], ['greeting', '开场白'], ['alternateGreetings', '备选开场'],
  ['description', '人设'], ['pace', '节奏'], ['tags', '标签'], ['category', '分类'], ['nsfw', '成人内容'],
];
const CARD_FIELDS: [string, string][] = [
  ['personality', '性格'], ['scenario', '场景'], ['mesExample', '对话示例'], ['systemPrompt', '系统提示'], ['postHistory', '历史后指令'], ['creatorNotes', '作者备注'],
];

const norm = (value: unknown) => JSON.stringify(value ?? (Array.isArray(value) ? [] : '')).replace(/^""$|^\[\]$|^null$|^false$/, '');

export function changedFields(snapshot: Snapshot, current: Snapshot): string[] {
  const out: string[] = [];
  for (const [key, label] of FIELDS) if (norm(snapshot[key]) !== norm(current[key])) out.push(label);
  // 旧版本没存高级字段时不比较，避免误报
  if (snapshot.card && typeof snapshot.card === 'object') {
    const a = snapshot.card as Record<string, unknown>;
    const b = (current.card ?? {}) as Record<string, unknown>;
    for (const [key, label] of CARD_FIELDS) if (norm(a[key]) !== norm(b[key])) out.push(label);
  }
  return out;
}

function excerpt(text: unknown, n = 140) {
  const value = String(text ?? '').trim();
  return value.length > n ? `${value.slice(0, n)}…` : value;
}

export function VersionList({ characterId, versions, current }: { characterId: string; versions: Version[]; current?: Snapshot }) {
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  // 时间按浏览器时区显示，挂载后再格式化，避免服务端与客户端时区不同导致 hydration 不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const when = (ms: number) => (mounted
    ? new Date(ms).toLocaleString(document.documentElement.lang === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '');

  const restore = async (version: Version) => {
    if (!window.confirm(tr('用 v{n} 覆盖当前内容？当前内容会先留成新的一版。', { n: version.revision }))) return;
    setBusyId(version.id);
    setError('');
    try {
      await api(`/api/characters/${characterId}/versions/${version.id}/restore`, { method: 'POST' });
      // 表单是客户端状态，恢复后整页刷新才能看到旧内容
      window.location.reload();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="p-card p-card--pad version-list" style={{ marginTop: 20 }} aria-labelledby="version-list-title">
      <h2 className="p-form-section-title" id="version-list-title">作品版本</h2>
      <p className="p-small">每次改动保存前自动留一版，最多保留 20 版。恢复会用那一版覆盖当前内容，当前内容也会先留一版，随时能撤回。</p>
      <ErrorLine message={error} />
      <div className="p-rows">
        {versions.map((version) => {
          const changes = current ? changedFields(version.snapshot, current) : [];
          const open = openId === version.id;
          return (
            <div className="p-room-card version-row" key={version.id} style={{ padding: '12px 16px', display: 'block' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="p-room-main" style={{ flex: 1, minWidth: 0 }}>
                  <div className="p-room-title">
                    <span>v{version.revision} · {version.snapshot.name ?? '未命名'}</span>
                    <span className="p-pill p-pill--sm p-pill--outline">{when(version.createdAt)}</span>
                  </div>
                  <p className="p-room-last">
                    {current
                      ? changes.length
                        ? tr('和现在相比改过：{list}', { list: changes.map((label) => tr(label)).join(tr('、')) })
                        : '和现在的内容一样'
                      : excerpt(version.snapshot.hook, 60)}
                  </p>
                </div>
                <div className="p-library-actions" style={{ flex: 'none' }}>
                  <button className="p-btn p-btn--sm p-btn--ghost" type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : version.id)}>
                    {open ? '收起' : '预览'}
                  </button>
                  <button className="p-btn p-btn--sm" type="button" disabled={busyId === version.id || (current ? changes.length === 0 : false)} onClick={() => void restore(version)}>
                    {busyId === version.id ? '恢复中…' : '恢复这一版'}
                  </button>
                </div>
              </div>
              {open && (
                <dl className="version-preview" data-no-i18n="">
                  {(['hook', 'greeting', 'description'] as const).map((key) => (
                    version.snapshot[key] ? (
                      <div key={key}>
                        <dt>{tr(FIELDS.find(([k]) => k === key)?.[1] ?? key)}</dt>
                        <dd>{excerpt(version.snapshot[key], 400)}</dd>
                      </div>
                    ) : null
                  ))}
                </dl>
              )}
            </div>
          );
        })}
        {!versions.length && <p className="p-small">还没有历史版本。修改并保存后会生成第一版。</p>}
      </div>
    </section>
  );
}
