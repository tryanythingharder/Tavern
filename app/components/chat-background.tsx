'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, api } from '@/components/settings-ui';
import { askConfirm } from '@/components/ui-dialog';

// 聊天背景（对齐 ST Backgrounds）：背景库 + 默认背景 + 锁定到这段故事；遮罩浓度记在本机。

const DIM_KEY = 'tavern:chat-bg-dim';
const DEFAULT_DIM = 72;

export function ChatBackdropLayer({ src }: { src: string | null }) {
  useEffect(() => {
    const apply = () => {
      let dim = DEFAULT_DIM;
      try { const raw = localStorage.getItem(DIM_KEY); if (raw !== null) dim = Math.max(0, Math.min(95, Number(raw) || 0)); } catch { /* 隐私模式 */ }
      document.documentElement.style.setProperty('--chat-bg-scrim', String(dim / 100));
    };
    apply();
    window.addEventListener('tavern:chat-bg-dim', apply);
    return () => { window.removeEventListener('tavern:chat-bg-dim', apply); document.documentElement.style.removeProperty('--chat-bg-scrim'); };
  }, []);
  if (!src) return null;
  return <div className="chat-bg" aria-hidden="true" style={{ backgroundImage: `url(${JSON.stringify(src)})` }} />;
}

type Bg = { id: number; name: string; src: string };

export function ChatBackgroundButton({ kind, id, value }: { kind: 'chat' | 'room'; id: number; value: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn--sm" type="button" onClick={() => setOpen(true)} title="聊天背景">背景</button>
      {open && <BackgroundPicker kind={kind} id={id} value={value} onClose={() => setOpen(false)} />}
    </>
  );
}

function BackgroundPicker({ kind, id, value: initial, onClose }: { kind: 'chat' | 'room'; id: number; value: string | null; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<Bg[] | null>(null);
  const [global, setGlobal] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(initial); // 这段故事：null 跟随默认 / '' 无 / 地址
  const [scope, setScope] = useState<'thread' | 'global'>(initial !== null ? 'thread' : 'global');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [dim, setDim] = useState(DEFAULT_DIM);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const threadUrl = `/api/${kind === 'chat' ? 'chats' : 'rooms'}/${id}/background`;

  useEffect(() => {
    api<{ backgrounds: Bg[]; global: string | null }>('/api/backgrounds').then((d) => { setList(d.backgrounds); setGlobal(d.global); }).catch((e: Error) => setNote(e.message));
    try { const raw = localStorage.getItem(DIM_KEY); if (raw !== null) setDim(Number(raw) || 0); } catch { /* 隐私模式 */ }
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null);
    try { await fn(); router.refresh(); } catch (e) { setNote((e as Error).message); } finally { setBusy(false); }
  };
  const choose = (src: string | null) => run(async () => {
    if (scope === 'global') {
      const d = await api<{ global: string | null }>('/api/backgrounds', { method: 'PUT', body: JSON.stringify({ global: src }) });
      setGlobal(d.global);
    } else {
      const v = src ?? '';
      await api(threadUrl, { method: 'PUT', body: JSON.stringify({ value: v }) });
      setValue(v);
    }
  });
  const unlock = () => run(async () => { await api(threadUrl, { method: 'PUT', body: JSON.stringify({ value: null }) }); setValue(null); setScope('global'); });
  const upload = (files: FileList | null) => files?.length && run(async () => {
    const form = new FormData();
    for (const f of Array.from(files)) form.append('files', f);
    const res = await fetch('/api/backgrounds', { method: 'POST', body: form });
    const d = (await res.json()) as { backgrounds?: Bg[]; added?: number; skipped?: string[]; message?: string };
    if (!res.ok) throw new Error(d.message || '上传失败');
    setList(d.backgrounds ?? []);
    if (d.skipped?.length) setNote(`跳过 ${d.skipped.length} 个不是图片或太大的文件`);
  });
  const remove = (bg: Bg) => run(async () => {
    if (!(await askConfirm({ title: '删除背景', message: `从背景库删除「${bg.name}」？用着它的故事会改回默认。`, confirmLabel: '删除', danger: true }))) return;
    const d = await api<{ backgrounds: Bg[]; global: string | null }>('/api/backgrounds', { method: 'DELETE', body: JSON.stringify({ id: bg.id }) });
    setList(d.backgrounds); setGlobal(d.global);
    if (value === bg.src) setValue(null);
  });
  const onDim = (n: number) => {
    setDim(n);
    try { localStorage.setItem(DIM_KEY, String(n)); } catch { /* 隐私模式 */ }
    window.dispatchEvent(new Event('tavern:chat-bg-dim'));
  };

  const selected = scope === 'global' ? global : (value ?? global);
  const noneSelected = scope === 'global' ? !global : value === '';
  return (
    <Modal title="聊天背景" onClose={onClose}
      footer={<button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? '处理中…' : '上传背景'}</button>}>
      <div className="cbg-scope" role="radiogroup" aria-label="应用范围">
        <button type="button" role="radio" aria-checked={scope === 'thread'} className={scope === 'thread' ? 'is-on' : ''} onClick={() => setScope('thread')}>只用在这段故事{value !== null ? ' · 已锁定' : ''}</button>
        <button type="button" role="radio" aria-checked={scope === 'global'} className={scope === 'global' ? 'is-on' : ''} onClick={() => setScope('global')}>所有故事的默认</button>
        {value !== null && <button type="button" className="cbg-unlock" disabled={busy} onClick={unlock}>改回跟随默认</button>}
      </div>
      {note && <p className="spm-note" role="status">{note}</p>}
      <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.zip" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      {!list ? <p className="spm-note">加载中…</p> : (
        <div className="cbg-grid">
          <button type="button" className={`cbg-tile cbg-none${noneSelected ? ' is-on' : ''}`} disabled={busy} onClick={() => choose(null)}>
            <span>无背景</span>
          </button>
          {list.map((bg) => (
            <div className={`cbg-tile${!noneSelected && selected === bg.src ? ' is-on' : ''}`} key={bg.id}>
              <button type="button" className="cbg-pick" disabled={busy} onClick={() => choose(bg.src)} aria-label={`用「${bg.name}」做背景`}>
                <img src={bg.src} alt="" loading="lazy" />
              </button>
              <span className="cbg-name" title={bg.name}>{bg.name}</span>
              <button type="button" className="cbg-del" disabled={busy} onClick={() => remove(bg)} aria-label={`删除「${bg.name}」`}>✕</button>
            </div>
          ))}
          {!list.length && <p className="cbg-empty">还没有背景。上传图片或 ST 背景的 zip，文件名就是背景名。</p>}
        </div>
      )}
      <label className="cbg-dim">
        <span>遮罩浓度</span>
        <input type="range" min={0} max={95} step={1} value={dim} onChange={(e) => onDim(Number(e.target.value))} />
        <output>{dim}%</output>
      </label>
    </Modal>
  );
}
