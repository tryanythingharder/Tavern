'use client';

import { useState } from 'react';
import type { CharacterOverride } from '@/lib/cards';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type CharacterItem = { id: string; name: string; hook: string };

function blank(id: string): CharacterOverride {
  return { characterId: id, systemPrompt: '', postHistory: '', mesExample: '', depthPrompt: '', depthDepth: 4, depthRole: 'system' };
}

export function CardsEditor({ characters, initial }: { characters: CharacterItem[]; initial: Record<string, CharacterOverride> }) {
  const [overrides, setOverrides] = useState<Record<string, CharacterOverride>>(initial);
  const [draft, setDraft] = useState<CharacterOverride | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const { override } = await api<{ override: CharacterOverride }>(`/api/cards/${draft.characterId}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setOverrides((prev) => ({ ...prev, [override.characterId]: override }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/cards/${draft.characterId}`, { method: 'DELETE' });
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[draft.characterId];
        return next;
      });
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const hasContent = (override: CharacterOverride | undefined) =>
    Boolean(override && (override.systemPrompt || override.postHistory || override.mesExample || override.depthPrompt));

  return (
    <>
      <ErrorLine message={error} />
      {saved && <p className="small" role="status" style={{ color: 'var(--ok, #2e7d43)' }}>已保存</p>}
      <div className="p-rows">
        {characters.map((character) => {
          const override = overrides[character.id];
          return (
            <div className="p-room-card" key={character.id}>
              <div className="p-room-main">
                <div className="p-room-title">{character.name}</div>
                <div className="p-room-last">{hasContent(override) ? '已设置卡内提示词' : character.hook}</div>
              </div>
              <div className="p-library-actions">
                <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft(override ? { ...override } : blank(character.id))}>编辑</button>
              </div>
            </div>
          );
        })}
      </div>

      {draft && (
        <Modal
          title={`角色卡字段 · ${characters.find((character) => character.id === draft.characterId)?.name ?? ''}`}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="p-btn p-btn--sm p-btn--danger" type="button" disabled={busy} onClick={() => void clear()}>清除覆盖</button>
              <button className="p-btn p-btn--sm p-btn--primary" type="button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          <p className="small" style={{ marginTop: 0 }}>这些字段对应 SillyTavern 角色卡；留空表示用预设的默认值。只影响你自己的对话。</p>
          <div className="p-field">
            <label>角色系统提示（system_prompt）</label>
            <textarea className="p-textarea" rows={4} value={draft.systemPrompt} placeholder="留空则用预设的系统提示；可写 {{original}} 引用原文" onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })} />
          </div>
          <div className="p-field">
            <label>历史后指令（post_history_instructions）</label>
            <textarea className="p-textarea" rows={3} value={draft.postHistory} placeholder="放在历史之后的补充规则；可写 {{original}}" onChange={(event) => setDraft({ ...draft, postHistory: event.target.value })} />
          </div>
          <div className="p-field">
            <label>对话示例（mes_example）</label>
            <textarea className="p-textarea" rows={5} value={draft.mesExample} placeholder={'<START>\n{{user}}：你好。\n{{char}}：……'} onChange={(event) => setDraft({ ...draft, mesExample: event.target.value })} />
          </div>
          <div className="p-field">
            <label>角色深度提示（depth_prompt）</label>
            <textarea className="p-textarea" rows={3} value={draft.depthPrompt} placeholder="插入到倒数第 N 条消息之前，常用于持续提醒角色状态" onChange={(event) => setDraft({ ...draft, depthPrompt: event.target.value })} />
          </div>
          <div className="p-field-row">
            <div className="p-field">
              <label>深度</label>
              <input className="p-input" type="number" min={0} max={999} value={draft.depthDepth} onChange={(event) => setDraft({ ...draft, depthDepth: Number(event.target.value) })} />
            </div>
            <div className="p-field">
              <label>身份</label>
              <select className="p-select" value={draft.depthRole} onChange={(event) => setDraft({ ...draft, depthRole: event.target.value as CharacterOverride['depthRole'] })}>
                <option value="system">系统</option>
                <option value="user">玩家</option>
                <option value="assistant">角色</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
