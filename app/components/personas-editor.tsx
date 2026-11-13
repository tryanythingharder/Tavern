'use client';

import { useState } from 'react';
import type { Persona } from '@/lib/resources';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

const POSITIONS: [Persona['position'], string][] = [
  ['prompt', '提示词里（身份块）'],
  ['depth', '聊天内 · 按深度'],
  ['none', '不进入上下文'],
];

export function PersonasEditor({ initial, characters }: { initial: Persona[]; characters: { id: string; name: string }[] }) {
  const [personas, setPersonas] = useState<Persona[]>(initial);
  const [draft, setDraft] = useState<Persona | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        position: draft.position,
        depth: draft.depth,
        role: draft.role,
        boundCharacters: draft.boundCharacters,
      };
      if (draft.id) {
        const { persona } = await api<{ persona: Persona }>(`/api/personas/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setPersonas((prev) => prev.map((item) => (item.id === persona.id ? persona : item)));
      } else {
        const { persona } = await api<{ persona: Persona }>('/api/personas', { method: 'POST', body: JSON.stringify(payload) });
        setPersonas((prev) => [persona, ...prev]);
      }
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/personas/${id}`, { method: 'DELETE' });
      setPersonas((prev) => prev.filter((item) => item.id !== id));
      setConfirmId(null);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button
          className="btn btn--primary btn--sm"
          type="button"
          onClick={() => setDraft({ id: 0, name: '旅人', description: '', position: 'prompt', depth: 2, role: 'system', boundCharacters: [] })}
        >
          新建身份
        </button>
      </div>
      <ErrorLine message={error} />

      <div className="p-rows">
        {personas.map((persona) => (
          <div className="p-room-card" key={persona.id}>
            <div className="p-room-main">
              <div className="p-room-title">{persona.name}</div>
              <div className="p-room-last">
                {POSITIONS.find(([key]) => key === persona.position)?.[1]}
                {persona.position === 'depth' ? ` · 深度 ${persona.depth}` : ''}
                {persona.boundCharacters.length ? ` · 绑定 ${persona.boundCharacters.map((id) => characters.find((c) => c.id === id)?.name ?? id).join('、')}` : ''}
              </div>
            </div>
            <div className="p-library-actions">
              {confirmId === persona.id ? (
                <>
                  <button className="p-btn p-btn--sm p-btn--danger" type="button" onClick={() => void remove(persona.id)}>确认删除</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(null)}>取消</button>
                </>
              ) : (
                <>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft({ ...persona })}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(persona.id)}>删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!personas.length && <p className="small">还没有身份。身份决定「你是谁」——会进入上下文，让角色知道该怎么称呼你。</p>}
      </div>

      {draft && (
        <Modal
          title={draft.id ? '编辑身份' : '新建身份'}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft(null)}>取消</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          <div className="p-field">
            <label>显示名</label>
            <input className="p-input" value={draft.name} maxLength={30} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="p-field">
            <label>身份说明</label>
            <textarea className="p-textarea" rows={4} value={draft.description} placeholder="你在故事里的身份、外貌、与角色的关系……" onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="p-field-row">
            <div className="p-field">
              <label>进入位置</label>
              <select className="p-select" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value as Persona['position'] })}>
                {POSITIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            {draft.position === 'depth' && (
              <>
                <div className="p-field">
                  <label>深度</label>
                  <input className="p-input" type="number" min={0} max={999} value={draft.depth} onChange={(event) => setDraft({ ...draft, depth: Number(event.target.value) })} />
                </div>
                <div className="p-field">
                  <label>身份</label>
                  <select className="p-select" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Persona['role'] })}>
                    <option value="system">系统</option>
                    <option value="user">玩家</option>
                    <option value="assistant">角色</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <div className="p-field">
            <label>绑定角色（和这些角色开新故事时默认用这个身份）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
              {characters.map((character) => (
                <label className="p-check" key={character.id}>
                  <input
                    type="checkbox"
                    checked={draft.boundCharacters.includes(character.id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        boundCharacters: event.target.checked
                          ? [...draft.boundCharacters, character.id]
                          : draft.boundCharacters.filter((id) => id !== character.id),
                      })
                    }
                  />
                  <span>{character.name}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
