'use client';
import { joinList } from '@/lib/i18n/runtime';

import { useEffect, useRef, useState } from 'react';
import { Modal, api } from '@/components/settings-ui';
import { askConfirm } from '@/components/ui-dialog';
import { EXPRESSION_LABELS, EXPRESSION_ZH, type ExpressionLabel } from '@/lib/expressions';

// 表情立绘管理（ST Character Expressions）：导入 ST 表情包 zip / 多张图片（文件名即标签），
// 也可以给单个标签补一张。作者上传的所有玩家可见；玩家自己上传的只自己可见，同标签优先用自己的。

type Sprite = { id: number; label: ExpressionLabel; src: string; mine: boolean; byAuthor: boolean };

export function SpriteManager({ characterId, onClose, onChange }: { characterId: string; onClose: () => void; onChange: () => void }) {
  const [sprites, setSprites] = useState<Sprite[] | null>(null);
  const [isAuthor, setIsAuthor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const bulkRef = useRef<HTMLInputElement | null>(null);
  const oneRef = useRef<HTMLInputElement | null>(null);
  const [target, setTarget] = useState<ExpressionLabel | null>(null);
  const base = `/api/characters/${encodeURIComponent(characterId)}/sprites`;

  useEffect(() => {
    api<{ sprites: Sprite[]; isAuthor: boolean }>(base).then((data) => { setSprites(data.sprites); setIsAuthor(data.isAuthor); })
      .catch((error: Error) => setNote(error.message));
  }, [base]);

  const upload = async (files: FileList | null, label?: ExpressionLabel) => {
    if (!files?.length) return;
    setBusy(true); setNote(null);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append('files', file);
      if (label) form.append('label', label);
      const res = await fetch(base, { method: 'POST', body: form });
      const data = (await res.json()) as { added?: number; skipped?: string[]; sprites?: Sprite[]; message?: string };
      if (!res.ok) throw new Error(data.message || '上传失败');
      setSprites(data.sprites ?? []);
      const skipped = data.skipped ?? [];
      setNote(`导入 ${data.added ?? 0} 张${skipped.length ? `，跳过 ${skipped.length} 个（文件名不是表情标签或不是图片）：${joinList(skipped.slice(0, 5))}${skipped.length > 5 ? '…' : ''}` : ''}`);
      onChange();
    } catch (error) { setNote((error as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (ids: number[] | 'all') => {
    if (ids === 'all' && !(await askConfirm({ title: '清空我上传的表情', message: '只删除你自己上传的，作者提供的不受影响。', confirmLabel: '清空', danger: true }))) return;
    setBusy(true);
    try {
      const data = await api<{ sprites: Sprite[] }>(base, { method: 'DELETE', body: JSON.stringify(ids === 'all' ? { all: true } : { ids }) });
      setSprites(data.sprites); onChange();
    } catch (error) { setNote((error as Error).message); }
    finally { setBusy(false); }
  };

  const mineCount = sprites?.filter((s) => s.mine).length ?? 0;
  return (
    <Modal title="表情立绘" onClose={onClose}
      footer={<>
        {mineCount > 0 && <button className="btn btn--sm" type="button" disabled={busy} onClick={() => remove('all')}>清空我上传的</button>}
        <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => bulkRef.current?.click()}>{busy ? '上传中…' : '导入表情包'}</button>
      </>}>
      <p className="spm-intro">
        回复后按情绪自动切换立绘，显示在沉浸模式左侧的画廊。可以直接导入 ST 的表情包 zip，或多选图片：文件名就是表情，例如 <code>joy.png</code>、<code>anger-2.png</code>。
        {isAuthor ? '你是作者，上传的所有玩家都能看到。' : '你上传的只有自己看得到。'}
      </p>
      {note && <p className="spm-note" role="status">{note}</p>}
      <input ref={bulkRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,.zip,application/zip"
        onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      <input ref={oneRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => { if (target) void upload(e.target.files, target); e.target.value = ''; }} />
      {!sprites ? <p className="spm-note">加载中…</p> : (
        <div className="spm-grid">
          {EXPRESSION_LABELS.map((label) => {
            const list = sprites.filter((s) => s.label === label);
            return (
              <div className={`spm-cell${list.length ? '' : ' is-empty'}`} key={label}>
                <div className="spm-thumb">
                  {list.length ? <img src={list.find((s) => s.mine)?.src ?? list[0].src} alt={EXPRESSION_ZH[label]} loading="lazy" /> : <span aria-hidden="true">＋</span>}
                  {list.length > 1 && <span className="spm-count">{list.length}</span>}
                </div>
                <div className="spm-label">{EXPRESSION_ZH[label]}<small>{label}</small></div>
                <div className="spm-acts">
                  <button type="button" disabled={busy} onClick={() => { setTarget(label); oneRef.current?.click(); }}>{list.length ? '再加' : '上传'}</button>
                  {list.some((s) => s.mine) && <button type="button" disabled={busy} onClick={() => remove(list.filter((s) => s.mine).map((s) => s.id))}>删除</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
