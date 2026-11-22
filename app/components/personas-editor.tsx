'use client';

import { useRef, useState } from 'react';
import type { Persona } from '@/lib/resources';
import { ErrorLine, Modal, api } from '@/components/settings-ui';
import { UserAvatar } from '@/components/persona-switch';
import { Select } from '@/components/ui-select';

// ST 的身份说明位置（persona_description_positions）
const POSITIONS: [Persona['position'], string][] = [
  ['prompt', '提示词里（身份块）'],
  ['anTop', '作者注释顶部'],
  ['anBottom', '作者注释底部'],
  ['depth', '聊天内 · 按深度'],
  ['none', '不进入上下文'],
];

type Draft = Persona & { avatarData?: string };

const blank = (): Draft => ({ id: 0, name: '旅人', description: '', position: 'prompt', depth: 2, role: 'system', boundCharacters: [], avatar: null, isDefault: false, lorebookId: null });

function readImage(file: File): Promise<string> {
  // 头像缩到 256px 再存（ST 也是存一张小图），避免把手机原图塞进库里
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读不了这张图片'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('不是有效的图片'));
      image.onload = () => {
        const size = 256;
        const scale = Math.min(1, size / Math.min(image.width, image.height));
        const w = Math.round(image.width * scale);
        const h = Math.round(image.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(w, size);
        canvas.height = Math.min(h, size);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        // 居中裁成正方形
        ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        resolve(canvas.toDataURL('image/webp', 0.88));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function PersonasEditor({ initial, characters, lorebooks }: { initial: Persona[]; characters: { id: string; name: string }[]; lorebooks: { id: number; name: string }[] }) {
  const [personas, setPersonas] = useState<Persona[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const importRef = useRef<HTMLInputElement | null>(null);
  const avatarRef = useRef<HTMLInputElement | null>(null);

  const sorted = (list: Persona[]) => [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  const nameOf = (id: string) => characters.find((c) => c.id === id)?.name ?? id;

  const upsert = (persona: Persona) =>
    setPersonas((prev) => {
      const others = prev.filter((item) => item.id !== persona.id).map((item) => (persona.isDefault ? { ...item, isDefault: false } : item));
      return sorted([persona, ...others]);
    });

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
        lorebookId: draft.lorebookId,
        isDefault: draft.isDefault,
        ...(draft.avatarData ? { avatarData: draft.avatarData } : { avatar: draft.avatar }),
      };
      const { persona } = draft.id
        ? await api<{ persona: Persona }>(`/api/personas/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<{ persona: Persona }>('/api/personas', { method: 'POST', body: JSON.stringify(payload) });
      upsert(persona);
      setDraft(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (persona: Persona) => {
    setError('');
    try {
      const { persona: next } = await api<{ persona: Persona }>(`/api/personas/${persona.id}`, { method: 'PATCH', body: JSON.stringify({ isDefault: !persona.isDefault }) });
      upsert(next);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const duplicate = async (persona: Persona) => {
    setError('');
    try {
      const { persona: copy } = await api<{ persona: Persona }>('/api/personas', {
        method: 'POST',
        body: JSON.stringify({ ...persona, id: undefined, name: `${persona.name}（副本）`.slice(0, 30), isDefault: false, boundCharacters: [] }),
      });
      upsert(copy);
    } catch (caught) {
      setError((caught as Error).message);
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

  const importFile = async (file: File) => {
    setError('');
    setNotice('');
    try {
      const body = await file.text();
      const result = await api<{ created: number; skipped: number; personas: Persona[] }>('/api/personas/import', { method: 'POST', body });
      setPersonas(sorted(result.personas));
      setNotice(`导入 ${result.created} 个身份${result.skipped ? `，跳过 ${result.skipped} 个重复的` : ''}。头像不在备份里，需要的话逐个上传。`);
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const pickAvatar = async (file: File) => {
    if (!draft) return;
    try {
      const data = await readImage(file);
      setDraft({ ...draft, avatarData: data });
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const shownChars = draft
    ? characters.filter((c) => draft.boundCharacters.includes(c.id) || !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => { setQuery(''); setDraft(blank()); }}>新建身份</button>
        <button className="p-btn p-btn--sm" type="button" onClick={() => importRef.current?.click()} title="SillyTavern：身份管理 → 备份 导出的 JSON">导入 ST 身份备份</button>
        {personas.length > 0 && <a className="p-btn p-btn--sm" href="/api/personas/export" download>导出（ST 格式）</a>}
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file); }}
        />
      </div>
      <ErrorLine message={error} />
      {notice && <p className="small" role="status">{notice}</p>}

      <div className="p-rows">
        {personas.map((persona) => (
          <div className="p-room-card" key={persona.id}>
            <UserAvatar name={persona.name} avatar={persona.avatar} size={40} />
            <div className="p-room-main">
              <div className="p-room-title">
                {persona.name}
                <span className="pz-badges">
                  {persona.isDefault && <em>默认</em>}
                  {persona.lorebookId && <em>世界书</em>}
                </span>
              </div>
              <div className="p-room-last">
                {POSITIONS.find(([key]) => key === persona.position)?.[1]}
                {persona.position === 'depth' ? ` · 深度 ${persona.depth}` : ''}
                {persona.boundCharacters.length ? ` · 绑定 ${persona.boundCharacters.map(nameOf).join('、')}` : ''}
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
                  <button className="p-btn p-btn--sm" type="button" onClick={() => { setQuery(''); setDraft({ ...persona }); }}>编辑</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => void makeDefault(persona)}>{persona.isDefault ? '取消默认' : '设为默认'}</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => void duplicate(persona)}>复制</button>
                  <button className="p-btn p-btn--sm" type="button" onClick={() => setConfirmId(persona.id)}>删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {!personas.length && <p className="small">还没有身份。身份决定「你是谁」：名字会用在 {'{{user}}'}，说明会进入上下文，让角色知道你的样子和关系。</p>}
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
            <label>头像</label>
            <div className="pz-avatar-pick">
              <UserAvatar name={draft.name} avatar={draft.avatarData ?? draft.avatar} size={56} />
              <button className="p-btn p-btn--sm" type="button" onClick={() => avatarRef.current?.click()}>{draft.avatar || draft.avatarData ? '换一张' : '上传'}</button>
              {(draft.avatar || draft.avatarData) && (
                <button className="p-btn p-btn--sm" type="button" onClick={() => setDraft({ ...draft, avatar: null, avatarData: undefined })}>移除</button>
              )}
              <input ref={avatarRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void pickAvatar(file); }} />
            </div>
          </div>
          <div className="p-field">
            <label>显示名（{'{{user}}'}）</label>
            <input className="p-input" value={draft.name} maxLength={30} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="p-field">
            <label>身份说明（{'{{persona}}'}）</label>
            <textarea className="p-textarea" rows={5} value={draft.description} placeholder="你在故事里的身份、外貌、与角色的关系……可以用 {{char}} {{user}}" onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          <div className="p-field-row">
            <div className="p-field">
              <label>说明放在哪</label>
              <Select className="p-select" value={draft.position} onChange={(event) => setDraft({ ...draft, position: event.target.value as Persona['position'] })}>
                {POSITIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </Select>
            </div>
            {draft.position === 'depth' && (
              <>
                <div className="p-field">
                  <label>深度</label>
                  <input className="p-input" type="number" min={0} max={999} value={draft.depth} onChange={(event) => setDraft({ ...draft, depth: Number(event.target.value) })} />
                </div>
                <div className="p-field">
                  <label>以谁的口吻</label>
                  <Select className="p-select" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Persona['role'] })}>
                    <option value="system">系统</option>
                    <option value="user">玩家</option>
                    <option value="assistant">角色</option>
                  </Select>
                </div>
              </>
            )}
          </div>
          {(draft.position === 'anTop' || draft.position === 'anBottom') && (
            <p className="small" style={{ margin: '0 0 12px' }}>跟着作者注释走：注释在哪、隔几条插一次，身份说明就在哪、隔几条插一次（同 SillyTavern）。</p>
          )}
          <div className="p-field-row">
            <div className="p-field">
              <label>身份世界书</label>
              <Select className="p-select" value={draft.lorebookId ?? ''} onChange={(event) => setDraft({ ...draft, lorebookId: event.target.value ? Number(event.target.value) : null })}>
                <option value="">不绑定</option>
                {lorebooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}
              </Select>
            </div>
            <label className="p-check" style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} />
              <span>设为默认身份</span>
            </label>
          </div>
          <div className="p-field">
            <label>绑定角色（和这些角色聊天时自动用这个身份）</label>
            {characters.length > 8 && <input className="p-input" placeholder="搜索角色" value={query} onChange={(event) => setQuery(event.target.value)} style={{ marginBottom: 8 }} />}
            <div className="pz-bind">
              {shownChars.map((character) => (
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
              {!characters.length && <span className="small">和角色聊过之后就能在这里绑定</span>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
