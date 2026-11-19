'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileDrop } from '@/components/file-drop';
import { api } from '@/components/settings-ui';
import { cardFileBody, describeExtras, type ImportExtras } from '@/lib/card-file';
import { CompatList } from '@/components/compat-list';
import type { CompatReport } from '@/lib/card-compat';

// 制卡交给外部工具，平台负责「无损导入 → 补封面标签 → 发布」
const TOOLS = [
  { name: 'CardForge', kind: '桌面', note: 'MVU 变量、状态栏、世界书、EJS 一站式，适合做「游戏化」卡', url: 'https://github.com/Anastasia2372/sillytavern-cardforge' },
  { name: 'piney', kind: '网页', note: '卡 / 世界书 / 正则 / 美化 / 图库工作站，可自部署', url: 'https://github.com/andclear/piney' },
  { name: '妮卡角色工作室', kind: '在线', note: 'AI 补全、变量卡、开场美化，打开即用', url: 'https://github.com/HiUnikitty/Nika-Character-Studio' },
  { name: 'St_cardPlus', kind: '网页 / exe', note: '填表式制卡，世界书与正则生成器', url: 'https://github.com/jiuci18/st_cardplus' },
];

export function CardImportPanel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [done, setDone] = useState<{ id: string; name: string; extras: string; compat?: CompatReport } | null>(null);

  const send = async (body: { png?: string; json?: string }) => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ character: { id: string; name: string }; extras?: ImportExtras; compat?: CompatReport }>('/api/characters/import', { method: 'POST', body: JSON.stringify(body) });
      setDone({ id: result.character.id, name: result.character.name, extras: describeExtras(result.extras), compat: result.compat });
      setText('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ci-wrap">
      <header className="p-page-title">
        <div>
          <h1>发布角色</h1>
          <p>用你顺手的制卡工具做好卡，拖进来就能发布。世界书、正则、状态栏和美化都会一起带上，导出时原样还给你。</p>
        </div>
        <div className="p-page-title-actions">
          <Link className="p-btn" href="/create?tab=works">我的作品</Link>
        </div>
      </header>

      <section className="p-card p-card--pad ci-drop">
        {error && <p role="alert" className="p-form-error">{error}</p>}
        {done ? (
          <div className="p-notice ci-done" role="status">
            <div className="p-notice-main">
              <div className="p-notice-title">「{done.name}」已导入，现在是待审核状态</div>
              {done.compat?.items.length ? <CompatList report={done.compat} /> : done.extras && <div>{done.extras}</div>}
            </div>
            <Link className="p-btn p-btn--sm p-btn--primary" href={`/create?edit=${done.id}`}>补封面和标签</Link>
            <Link className="p-btn p-btn--sm" href={`/c/${done.id}`}>查看</Link>
            <button className="p-btn p-btn--sm" type="button" onClick={() => setDone(null)}>再导入一张</button>
          </div>
        ) : (
          <>
            <FileDrop
              accept="image/png,.png,.json,application/json"
              disabled={busy}
              title={busy ? '正在读取角色卡…' : '选择角色卡 PNG 或 JSON'}
              hint="点击选择，或拖到这里 · 支持 SillyTavern V1 / V2 / V3"
              onFile={(file) => { void cardFileBody(file).then(send, (caught: Error) => setError(caught.message)); }}
            />
            <details className="ci-paste">
              <summary>粘贴 JSON</summary>
              <textarea className="p-textarea cf-mono" rows={6} value={text} onChange={(event) => setText(event.target.value)} placeholder='{"spec":"chara_card_v2","data":{"name":"…"}}' />
              <button className="p-btn p-btn--sm" type="button" disabled={busy || !text.trim()} onClick={() => void send({ json: text })}>{busy ? '导入中…' : '导入'}</button>
            </details>
          </>
        )}
      </section>

      <section className="ci-tools" aria-labelledby="ci-tools-title">
        <h2 id="ci-tools-title" className="p-form-section-title">推荐的制卡工具</h2>
        <div className="ci-tool-grid">
          {TOOLS.map((tool) => (
            <a key={tool.name} className="p-card p-card--pad ci-tool" href={tool.url} target="_blank" rel="noreferrer noopener">
              <span className="ci-tool-name">{tool.name}<span className="p-pill p-pill--sm p-pill--outline">{tool.kind}</span></span>
              <span className="p-small">{tool.note}</span>
            </a>
          ))}
        </div>
        <p className="p-small">只想快速写一张简单的卡？<Link href="/create?blank=1">用简易表单</Link></p>
      </section>
    </div>
  );
}
