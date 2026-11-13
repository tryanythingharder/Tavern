'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type RoomItem = {
  id: number; name: string; characterIds: string[]; muted: string[]; strategy: string;
  autoMode: boolean; speakerId: string | null; lastMessage: string | null; updatedAt: number;
};
type CharacterItem = { id: string; name: string; initial: string; hue: number };

const STRATEGY_LABEL: Record<string, string> = {
  natural: '自然（叫到名字的人先答）',
  roundRobin: '轮流',
  manual: '手动选择',
  pooled: '随机',
};

function relative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

export function RoomsList({ rooms, characters }: { rooms: RoomItem[]; characters: CharacterItem[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [strategy, setStrategy] = useState('natural');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // 房间设置（名称 / 成员 / 静音 / 发言策略）
  const [settingsRoom, setSettingsRoom] = useState<RoomItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [editMuted, setEditMuted] = useState<string[]>([]);
  const [editStrategy, setEditStrategy] = useState('natural');
  const [editAutoMode, setEditAutoMode] = useState(false);
  const [editSpeakerId, setEditSpeakerId] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const openSettings = (room: RoomItem) => {
    setSettingsRoom(room);
    setEditName(room.name);
    setEditMembers(room.characterIds);
    setEditMuted(room.muted ?? []);
    setEditStrategy(room.strategy);
    setEditAutoMode(room.autoMode);
    setEditSpeakerId(room.speakerId ?? '');
    setSettingsError('');
  };

  const saveSettings = async () => {
    if (!settingsRoom) return;
    if (editMembers.length < 2) {
      setSettingsError('至少保留两位角色，房间才有群聊的感觉');
      return;
    }
    setSettingsBusy(true);
    setSettingsError('');
    try {
      await api(`/api/rooms/${settingsRoom.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName,
          characterIds: editMembers,
          muted: editMuted,
          strategy: editStrategy,
          autoMode: editAutoMode,
          speakerId: editSpeakerId || null,
        }),
      });
      setSettingsRoom(null);
      router.refresh();
    } catch (caught) {
      setSettingsError((caught as Error).message);
    } finally {
      setSettingsBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { room } = await api<{ room: { id: number } }>('/api/rooms', { method: 'POST', body: JSON.stringify({ name, characterIds: selected, strategy }) });
      router.push(`/rooms/${room.id}`);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await api(`/api/rooms/${id}`, { method: 'DELETE' });
      setConfirmId(null);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    }
  };

  const openCreate = () => { setCreating(true); setSelected([]); setName(''); setStrategy('natural'); };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>多角色房间</h1>
          <p>让角色在同一场戏里相遇，彼此回应。</p>
        </div>
        <div className="p-page-title-actions">
          <button className="p-btn p-btn--primary" type="button" onClick={openCreate}>创建房间</button>
        </div>
      </header>

      <div className="p-rooms-layout">
        <div>
          <div className="p-card p-rows">
            {rooms.map((room) => {
              const members = room.characterIds
                .map((id) => characters.find((character) => character.id === id))
                .filter((character): character is CharacterItem => Boolean(character));
              return (
                <div className="p-room-card" key={room.id}>
                  <span className="p-avatar" style={{ ['--size' as string]: '52px', ['--h' as string]: 210 }}>房</span>
                  <div className="p-room-main">
                    <div className="p-room-title">
                      <span>{room.name}</span>
                      <span className="p-pill p-pill--sm p-pill--outline">{members.length} 个角色</span>
                    </div>
                    <div className="p-room-members">
                      {members.map((member) => (
                        <span key={member.id}>
                          <span className="p-avatar" style={{ ['--size' as string]: '22px', ['--h' as string]: member.hue }}>{member.initial}</span>
                          {member.name}
                        </span>
                      ))}
                    </div>
                    <p className="p-room-last">{room.lastMessage ?? '还没有消息'}</p>
                    <div className="p-room-meta">{STRATEGY_LABEL[room.strategy] ?? room.strategy}{room.autoMode ? ' · 自动推进' : ''} · {relative(room.updatedAt)}活跃</div>
                  </div>
                  <div className="p-library-actions">
                    <Link className="p-btn p-btn--sm p-btn--primary" href={`/rooms/${room.id}`}>进入房间</Link>
                    <button className="p-btn p-btn--sm p-btn--icon" type="button" aria-label={`设置${room.name}`} onClick={() => openSettings(room)}>
                      <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
                    </button>
                    {confirmId === room.id ? (
                      <>
                        <button className="p-btn p-btn--sm" type="button" onClick={() => void remove(room.id)}>确认删除</button>
                        <button className="p-btn p-btn--sm p-btn--icon" type="button" aria-label="取消" onClick={() => setConfirmId(null)}>✕</button>
                      </>
                    ) : (
                      <button className="p-btn p-btn--sm p-btn--icon" type="button" aria-label={`删除房间 ${room.name}`} onClick={() => setConfirmId(room.id)}>
                        <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!rooms.length && (
              <div className="p-empty">
                <div className="p-empty-title">还没有房间</div>
                <p className="p-empty-text">选择两个以上的角色，让他们在同一场故事里相遇。</p>
                <button className="p-btn p-btn--primary" type="button" onClick={openCreate}>创建第一个房间</button>
              </div>
            )}
          </div>
        </div>

        <aside className="p-rooms-side">
          <section className="p-card p-card--pad">
            <h2 className="p-form-section-title">房间怎么玩</h2>
            <ol className="p-room-guide">
              <li><strong>选择角色</strong><span>至少两个角色会共享同一场对话；可以静音个别成员。</span></li>
              <li><strong>选择发言方式</strong><span>自然提及、顺序轮流、手动指定或随机一位；输入里 @角色名 随时点名。</span></li>
              <li><strong>继续同一段故事</strong><span>房间会话保留在「房间」里，可随时回来接着聊。</span></li>
            </ol>
          </section>
          <section className="p-card p-card--pad">
            <h2 className="p-form-section-title">使用说明</h2>
            <p className="p-small">房间里的回复同样由模型生成并按 token 扣点；成员、发言顺序与静音在房间右侧面板查看。</p>
            <button className="p-btn p-btn--block" type="button" style={{ marginTop: 14 }} onClick={openCreate}>
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              创建房间
            </button>
          </section>
        </aside>
      </div>

      <ErrorLine message={error} />

      {creating && (
        <Modal
          title="新建房间"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn--sm" type="button" onClick={() => setCreating(false)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={busy || !selected.length} onClick={() => void create()}>{busy ? '创建中…' : '创建并进入'}</button>
            </>
          }
        >
          <ErrorLine message={error} />
          <div className="field">
            <label>房间名称</label>
            <input className="input" value={name} maxLength={40} placeholder="例如：雨夜的报馆" onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label>成员（至少两个角色才有群聊的感觉）</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {characters.map((character) => (
                <label className="check" key={character.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(character.id)}
                    onChange={(event) => setSelected((prev) => (event.target.checked ? [...prev, character.id] : prev.filter((id) => id !== character.id)))}
                  />
                  <span>{character.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>发言顺序</label>
            <select className="select" value={strategy} onChange={(event) => setStrategy(event.target.value)}>
              {Object.entries(STRATEGY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <span className="hint">自然模式会在你的话里找角色名；轮流模式按发言次数最少的人先答；随机模式从成员池里抽。</span>
          </div>
        </Modal>
      )}
      {settingsRoom && (
        <Modal
          title="房间与发言设定"
          onClose={() => { if (!settingsBusy) setSettingsRoom(null); }}
          footer={
            <>
              <button className="btn btn--sm" type="button" disabled={settingsBusy} onClick={() => setSettingsRoom(null)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={settingsBusy} onClick={() => void saveSettings()}>{settingsBusy ? '保存中…' : '保存房间设定'}</button>
            </>
          }
        >
          <ErrorLine message={settingsError} />
          <div className="field">
            <label>故事名称</label>
            <input className="input" value={editName} maxLength={40} placeholder="例如：雨夜的报馆" onChange={(event) => setEditName(event.target.value)} />
          </div>
          <div className="field">
            <label>参与角色 · 至少两位</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {characters.map((character) => (
                <label className="check" key={character.id}>
                  <input
                    type="checkbox"
                    checked={editMembers.includes(character.id)}
                    onChange={(event) => {
                      const next = event.target.checked ? [...editMembers, character.id] : editMembers.filter((id) => id !== character.id);
                      setEditMembers(next);
                      if (!next.includes(character.id)) setEditMuted((prev) => prev.filter((id) => id !== character.id));
                    }}
                  />
                  <span>{character.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>静音 · 不参与发言</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {characters.filter((character) => editMembers.includes(character.id)).map((character) => (
                <label className="check" key={character.id}>
                  <input
                    type="checkbox"
                    checked={editMuted.includes(character.id)}
                    onChange={(event) => setEditMuted((prev) => (event.target.checked ? [...prev, character.id] : prev.filter((id) => id !== character.id)))}
                  />
                  <span>{character.name}<span className="hint"> 勾选后 @ 也不会点名</span></span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>发言顺序</label>
            <select className="select" value={editStrategy} onChange={(event) => setEditStrategy(event.target.value)}>
              {Object.entries(STRATEGY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <span className="hint">成员变化只影响后续回复，历史消息不会被删除。</span>
          </div>
          <div className="field">
            <label>指定模式的默认角色</label>
            <select className="select" value={editSpeakerId} onChange={(event) => setEditSpeakerId(event.target.value)}>
              <option value="">自动选择</option>
              {characters.filter((character) => editMembers.includes(character.id) && !editMuted.includes(character.id)).map((character) => (
                <option key={character.id} value={character.id}>{character.name}</option>
              ))}
            </select>
            <span className="hint">手动模式下默认由这个角色回应；被静音的成员不会出现在这里。</span>
          </div>
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={editAutoMode} onChange={(event) => setEditAutoMode(event.target.checked)} />
              <span>自动推进<span className="hint"> 首轮回应后，按顺序再让最多两位成员接话</span></span>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
