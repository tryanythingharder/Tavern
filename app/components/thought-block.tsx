'use client';

import { useEffect, useState } from 'react';

export type ThoughtView = { t: string; ms: number };

// ST 的推理折叠块：「思考中…」/「思考了 N 秒」，点开看模型的思考过程（纯文本）
export function ThoughtBlock({ thought, live, defaultOpen, onEdit }: { thought: ThoughtView; live?: boolean; defaultOpen?: boolean; onEdit?: () => void }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  useEffect(() => { setOpen(Boolean(defaultOpen)); }, [defaultOpen]);
  const seconds = thought.ms > 0 ? Math.max(1, Math.round(thought.ms / 1000)) : 0;
  const label = live ? '思考中…' : seconds ? `思考了 ${seconds} 秒` : '思考过程';
  return (
    <details className={`p-thought${live ? ' is-live' : ''}`} open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="p-thought-summary">
        <svg className="p-thought-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></svg>
        <span>{label}</span>
      </summary>
      <div className="p-thought-body">{thought.t}</div>
      {onEdit && !live ? (
        <div className="p-thought-foot">
          <button type="button" className="p-thought-edit-btn" onClick={onEdit}>编辑思考</button>
        </div>
      ) : null}
    </details>
  );
}

// 「默认展开思考」是账号里的全局设置，聊天页挂载时取一次
let cached: boolean | null = null;
export function useThoughtsOpen(): boolean {
  const [open, setOpen] = useState<boolean>(cached ?? false);
  useEffect(() => {
    if (cached !== null) return;
    let alive = true;
    fetch('/api/me/gen-prefs', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { prefs?: { reasoning?: { autoExpand?: boolean } } } | null) => {
        cached = Boolean(data?.prefs?.reasoning?.autoExpand);
        if (alive) setOpen(cached);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return open;
}
