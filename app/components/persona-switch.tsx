'use client';

import { useEffect, useRef, useState } from 'react';

export type PersonaOption = { id: number; name: string; avatar: string | null; isDefault: boolean; bound: boolean };
export type PersonaCurrent = { id: number | null; name: string; avatar: string | null };

// 玩家头像：有身份头像用图，没有用名字首字（各主题沿用 .p-avatar）
export function UserAvatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  return (
    <span className={`p-avatar${avatar ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: `${size}px`, ['--h' as string]: 28 }}>
      {avatar ? <img src={avatar} alt="" /> : Array.from(name || '你')[0]}
    </span>
  );
}

/**
 * 聊天里快速切换身份（ST：在聊天中选身份 = 锁定到这段聊天）。
 * 「跟随默认」= 解锁，按「绑定角色 → 默认身份」。已发出的消息保留当时的名字和头像。
 */
export function PersonaSwitch({ endpoint, personas, lockedId, current, onChange, scopeLabel = '本对话' }: {
  endpoint: string;
  personas: PersonaOption[];
  lockedId: number | null;
  current: PersonaCurrent;
  onChange: (next: { locked: number | null; persona: PersonaCurrent }) => void;
  scopeLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { if (!boxRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const pick = async (personaId: number | null) => {
    setSaving(true);
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personaId }) });
      if (response.ok) onChange((await response.json()) as { locked: number | null; persona: PersonaCurrent });
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const auto = personas.find((item) => item.bound) ?? personas.find((item) => item.isDefault);
  return (
    <div className="mp mp--persona" ref={boxRef}>
      <button type="button" className="mp-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} title="切换你在这段故事里的身份">
        <UserAvatar name={current.name} avatar={current.avatar} size={18} />
        <span className="mp-name">{current.name}</span>
        {lockedId ? <span className="mp-trigger-price" title={`已锁定到${scopeLabel}`}>锁定</span> : null}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="mp-pop" role="listbox" aria-label="选择身份">
          <div className="mp-head">
            <strong>你的身份</strong>
            <span>选一个身份会锁定到{scopeLabel}；已发出的消息保留当时的名字</span>
          </div>
          <div className="mp-list">
            <button type="button" role="option" aria-selected={!lockedId} className={`mp-opt${!lockedId ? ' is-on' : ''}`} disabled={saving} onClick={() => void pick(null)}>
              <span className="mp-opt-name">跟随默认</span>
              <span className="mp-opt-note">{auto ? `当前为「${auto.name}」${auto.bound ? '（绑定了这个角色）' : '（默认身份）'}` : '还没有默认身份，用账号昵称'}</span>
            </button>
            {personas.map((item) => (
              <button key={item.id} type="button" role="option" aria-selected={lockedId === item.id} className={`mp-opt mp-opt--persona${lockedId === item.id ? ' is-on' : ''}`} disabled={saving} onClick={() => void pick(item.id)}>
                <span className="mp-opt-name">
                  <UserAvatar name={item.name} avatar={item.avatar} size={20} />
                  {item.name}
                  {item.isDefault ? <em className="mp-tag">默认</em> : null}
                  {item.bound ? <em className="mp-tag">绑定</em> : null}
                </span>
              </button>
            ))}
            {!personas.length && <p className="mp-empty">还没有身份</p>}
          </div>
          <a className="mp-more" href="/me/personas">管理身份：头像、说明、默认与绑定 →</a>
        </div>
      )}
    </div>
  );
}
