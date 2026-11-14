'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { coverSrc } from '@/components/proto-cover';
import { ErrorLine, Modal, api } from '@/components/settings-ui';

type ChatItem = {
  id: number;
  characterId: string;
  name: string;
  initial: string;
  hue: number;
  ownerId: number | null;
  coverImage: string | null;
  title: string;
  lastMessage: string | null;
  lastMessageId: number | null;
  count: number;
  updatedAt: number;
};
type RoomItem = { id: number; name: string; lastMessage: string | null; count: number; updatedAt: number };
type CharacterOption = { id: string; name: string };

function relative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function MoreIcon() {
  return (
    <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </svg>
  );
}

export function ChatsBrowser({ chats, rooms, characters }: { chats: ChatItem[]; rooms: RoomItem[]; characters: CharacterOption[] }) {
  const router = useRouter();
  const [items, setItems] = useState(chats);
  const [query, setQuery] = useState('');
  const [character, setCharacter] = useState('all');

  // 管理会话
  const [manage, setManage] = useState<ChatItem | null>(null);
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 导入聊天记录
  const [importOpen, setImportOpen] = useState(false);
  const [importCharacter, setImportCharacter] = useState(characters[0]?.id ?? '');
  const [importTitle, setImportTitle] = useState('');
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState('');

  const charactersInChats = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((chat) => map.set(chat.characterId, chat.name));
    return [...map.entries()];
  }, [items]);

  const q = query.trim().toLowerCase();
  const showRooms = character === 'all' || character === 'rooms';
  const matchedChats = items.filter((chat) => {
    if (character !== 'all' && character !== 'rooms' && chat.characterId !== character) return false;
    if (!q) return true;
    return `${chat.name} ${chat.title} ${chat.lastMessage ?? ''}`.toLowerCase().includes(q);
  });
  const matchedRooms = showRooms
    ? rooms.filter((room) => (!q ? true : `${room.name} ${room.lastMessage ?? ''}`.toLowerCase().includes(q)))
    : [];
  const total = matchedChats.length + matchedRooms.length;

  const openManage = (chat: ChatItem) => {
    setManage(chat);
    setMode('menu');
    setRenameValue(chat.title);
    setError('');
  };

  const closeManage = () => {
    if (busy) return;
    setManage(null);
    setMode('menu');
  };

  const doRename = async () => {
    if (!manage) return;
    const title = renameValue.trim();
    if (!title) {
      setError('故事名称不能为空');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/api/chats/${manage.id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
      setItems((prev) => prev.map((item) => (item.id === manage.id ? { ...item, title } : item)));
      setManage(null);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doBranch = async () => {
    if (!manage?.lastMessageId) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ chatId: number }>(`/api/chats/${manage.id}/branch`, {
        method: 'POST',
        body: JSON.stringify({ messageId: manage.lastMessageId }),
      });
      setManage(null);
      router.push(`/chats/${result.chatId}`);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {    if (!manage) return;
    setBusy(true);
    setError('');
    try {
      await api(`/api/chats/${manage.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((item) => item.id !== manage.id));
      setManage(null);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openImport = () => {
    setImportOpen(true);
    setImportError('');
    setImportText('');
    setImportTitle('');
    if (!characters.some((item) => item.id === importCharacter)) setImportCharacter(characters[0]?.id ?? '');
  };

  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setImportError('文件超过 8MB');
      return;
    }
    setImportError('');
    setImportTitle(file.name);
    setImportText(await file.text());
  };

  const submitImport = async () => {
    if (!importCharacter) {
      setImportError('先选择一个角色，再导入聊天记录');
      return;
    }
    if (!importText.trim()) {
      setImportError('请选择文件或粘贴内容');
      return;
    }
    setImportBusy(true);
    setImportError('');
    try {
      const result = await api<{ chatId: number; count: number }>('/api/chats/import', {
        method: 'POST',
        body: JSON.stringify({ characterId: importCharacter, title: importTitle, text: importText }),
      });
      setImportOpen(false);
      router.push(`/chats/${result.chatId}`);
    } catch (caught) {
      setImportError((caught as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>对话</h1>
          <p>每一段未完的剧情，都可以从这里继续。</p>
        </div>
        <div className="p-page-title-actions">
          <button className="p-btn" type="button" onClick={openImport}>导入聊天记录</button>
          <Link className="p-btn p-btn--primary" href="/">发现新角色</Link>
        </div>
      </header>

      <div className="p-filterbar">
        <div className="p-filterbar-main">
          <label className="p-search">
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
            <input className="p-input" type="search" value={query} placeholder="搜索角色或对话内容" aria-label="搜索会话" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className="p-select" aria-label="按角色筛选" value={character} onChange={(event) => setCharacter(event.target.value)}>
            <option value="all">全部角色</option>
            {charactersInChats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            <option value="rooms">多角色房间</option>
          </select>
          <span className="p-filterbar-count">{total} 个故事 · 最近更新优先</span>
        </div>
      </div>

      <div className="p-chat-list">
        {matchedRooms.map((room) => (
          <div className="p-chat-row" key={`room-${room.id}`}>
            <Link className="p-chat-open" href={`/rooms/${room.id}`}>
              <div className="p-cover p-row-cover" style={{ ['--h' as string]: 210 }} data-initial={room.name.slice(0, 1)} role="img" aria-label={room.name}>
                {room.name.slice(0, 1)}
              </div>
              <div className="p-chat-row-main">
                <div className="p-chat-row-title"><span className="p-chat-row-name">{room.name}</span><span className="p-chat-row-session">多角色房间</span></div>
                <p className="p-chat-row-preview">{room.lastMessage ? cleanPreview(room.lastMessage) : '还没有消息'}</p>
                <div className="p-library-sub">房间 · {room.count} 条消息</div>
              </div>
            </Link>
            <div className="p-chat-row-meta"><span>{relative(room.updatedAt)}</span><span>{room.count} 条</span></div>
          </div>
        ))}

        {matchedChats.map((chat) => {
          const src = coverSrc({ id: chat.characterId, name: chat.name, initial: chat.initial, hue: chat.hue, ownerId: chat.ownerId, coverImage: chat.coverImage });
          return (
            <div className="p-chat-row" key={chat.id}>
              <Link className="p-chat-open" href={`/chats/${chat.id}`}>
                <div className={`p-cover p-row-cover${src ? ' has-portrait' : ''}`} style={{ ['--h' as string]: chat.hue }} data-initial={chat.initial} role="img" aria-label={`${chat.name}的立绘`}>
                  {src && <img src={src} alt="" loading="lazy" />}
                </div>
                <div className="p-chat-row-main">
                  <div className="p-chat-row-title"><span className="p-chat-row-name">{chat.name}</span><span className="p-chat-row-session">{chat.title}</span></div>
                  <p className="p-chat-row-preview">{chat.lastMessage ? cleanPreview(chat.lastMessage) : '还没有消息'}</p>
                  <div className="p-library-sub">本地保存 · {chat.count} 条消息</div>
                </div>
              </Link>
              <div className="p-chat-row-meta"><span>{relative(chat.updatedAt)}</span><span>{chat.count} 条</span></div>
              <div className="p-chat-row-action">
                <button className="p-btn p-btn--sm p-btn--icon" type="button" aria-label={`管理${chat.title}`} onClick={() => openManage(chat)}>
                  <MoreIcon />
                </button>
              </div>
            </div>
          );
        })}

        {!total && (
          <div className="p-empty">
            <div className="p-empty-title">还没有故事</div>
            <p className="p-empty-text">去发现一个角色，写下故事的第一句。</p>
            <Link className="p-btn p-btn--primary" href="/">去发现</Link>
          </div>
        )}
      </div>

      {manage && (
        <Modal
          title={mode === 'rename' ? '重命名故事' : mode === 'delete' ? '删除这段故事？' : '管理会话'}
          onClose={closeManage}
          footer={
            mode === 'menu' ? (
              <button className="btn btn--sm" type="button" onClick={closeManage}>关闭</button>
            ) : mode === 'rename' ? (
              <>
                <button className="btn btn--sm" type="button" onClick={() => { setMode('menu'); setError(''); }}>返回</button>
                <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => void doRename()}>{busy ? '保存中…' : '保存'}</button>
              </>
            ) : (
              <>
                <button className="btn btn--sm" type="button" onClick={() => { setMode('menu'); setError(''); }}>取消</button>
                <button className="btn btn--sm btn--danger" type="button" disabled={busy} onClick={() => void doDelete()}>{busy ? '删除中…' : '确认删除'}</button>
              </>
            )
          }
        >
          <ErrorLine message={error} />
          {mode === 'menu' && (
            <div className="p-choice-list">
              <button className="p-choice" type="button" onClick={() => { setMode('rename'); setError(''); }}>
                <span className="p-choice-main"><span className="p-choice-title">重命名故事</span><span className="p-choice-sub">{manage.title}</span></span>
              </button>
              <a className="p-choice" href={`/api/chats/${manage.id}/export?format=txt`} download>
                <span className="p-choice-main"><span className="p-choice-title">导出阅读用 txt</span><span className="p-choice-sub">纯文本对白，方便外发阅读</span></span>
              </a>
              <a className="p-choice" href={`/api/chats/${manage.id}/export?format=jsonl`} download>
                <span className="p-choice-main"><span className="p-choice-title">导出聊天记录</span><span className="p-choice-sub">SillyTavern 的 .jsonl，可直接导入 ST</span></span>
              </a>
              {manage.lastMessageId && (
                <button className="p-choice" type="button" disabled={busy} onClick={() => void doBranch()}>
                  <span className="p-choice-main"><span className="p-choice-title">复制为新分支</span><span className="p-choice-sub">保留原故事，从当前剧情探索另一种可能</span></span>
                </button>
              )}
              <button className="p-choice" type="button" onClick={() => { setMode('delete'); setError(''); }}>
                <span className="p-choice-main"><span className="p-choice-title">删除会话</span><span className="p-choice-sub">此操作不可撤销</span></span>
              </button>
            </div>
          )}
          {mode === 'rename' && (
            <div className="field">
              <label htmlFor="chat-rename">故事名称</label>
              <input id="chat-rename" className="input" maxLength={40} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
            </div>
          )}
          {mode === 'delete' && (
            <p style={{ margin: 0 }}>「{manage.title}」及其 {manage.count} 条消息会一起删除。请先导出需要保留的内容。</p>
          )}
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="导入聊天记录"
          onClose={() => { if (!importBusy) setImportOpen(false); }}
          footer={
            <>
              <button className="btn btn--sm" type="button" disabled={importBusy} onClick={() => setImportOpen(false)}>取消</button>
              <button className="btn btn--sm btn--primary" type="button" disabled={importBusy} onClick={() => void submitImport()}>{importBusy ? '导入中…' : '导入'}</button>
            </>
          }
        >
          <p className="small" style={{ marginTop: 0 }}>
            支持 SillyTavern 的 .jsonl（含候选与系统消息）、本站导出的记录，以及 Agnai / oobabooga / RisuAI / CAI Tools 的 .json。导入后成为一条新故事，不会覆盖已有记录。
          </p>
          <ErrorLine message={importError} />
          <div className="field">
            <label htmlFor="chat-import-character">属于哪个角色</label>
            <select id="chat-import-character" className="select" value={importCharacter} onChange={(event) => setImportCharacter(event.target.value)}>
              {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="chat-import-file">选择文件</label>
            <input id="chat-import-file" className="input" type="file" accept=".jsonl,.json,application/json" onChange={(event) => void readImportFile(event.target.files?.[0])} />
          </div>
          <div className="field">
            <label htmlFor="chat-import-text">或粘贴内容</label>
            <textarea id="chat-import-text" className="textarea" rows={5} value={importText} placeholder='{"user_name":"unused","character_name":"unused","chat_metadata":{}}' onChange={(event) => setImportText(event.target.value)} />
          </div>
        </Modal>
      )}
    </>
  );
}

function cleanPreview(text: string) {
  return text.replace(/\*([^*]+)\*/g, '$1').replace(/\(\(([^)]*)\)\)/g, '').replace(/\s+/g, ' ').trim();
}
