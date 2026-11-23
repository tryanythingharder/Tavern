'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { ImageCropper, type CropShape } from '@/components/image-cropper';
import { askConfirm, showAlert } from '@/components/ui-dialog';

type Kind = 'avatar' | 'banner';
const MAX_INPUT = 20 * 1024 * 1024;

/** 账号卡顶部：主页背景图 + 头像（点头像或按钮换图，站内裁剪后上传） */
export function ProfileMediaHeader({ nickname, avatar, banner, children }: { nickname: string; avatar: string | null; banner: string | null; children?: ReactNode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [picking, setPicking] = useState<Kind>('avatar');
  const [editing, setEditing] = useState<{ kind: Kind; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState({ avatar, banner });

  const pick = (kind: Kind) => {
    setPicking(kind);
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); }
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.type)) { void showAlert('请选择 PNG、JPG、WebP 或 GIF 图片'); return; }
    if (file.size > MAX_INPUT) { void showAlert('原图太大了，请选 20 MB 以内的图片'); return; }
    setError('');
    setEditing({ kind: picking, file });
  };

  const upload = async (blob: Blob) => {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('kind', editing.kind);
      form.set('file', new File([blob], `${editing.kind}.${blob.type === 'image/webp' ? 'webp' : 'png'}`, { type: blob.type }));
      const response = await fetch('/api/me/avatar', { method: 'POST', body: form });
      const data = (await response.json().catch(() => ({}))) as { message?: string; avatar?: string | null; banner?: string | null };
      if (!response.ok) throw new Error(data.message || `上传失败（${response.status}）`);
      setCurrent({ avatar: data.avatar ?? null, banner: data.banner ?? null });
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (kind: Kind) => {
    const ok = await askConfirm({ message: kind === 'avatar' ? '恢复成默认头像（昵称首字）？' : '移除主页背景图？', confirmLabel: kind === 'avatar' ? '恢复默认' : '移除', danger: kind === 'banner' });
    if (!ok) return;
    const response = await fetch('/api/me/avatar?kind=' + kind, { method: 'DELETE' });
    const data = (await response.json().catch(() => ({}))) as { message?: string; avatar?: string | null; banner?: string | null };
    if (!response.ok) { void showAlert(data.message || '操作失败'); return; }
    setCurrent({ avatar: data.avatar ?? null, banner: data.banner ?? null });
    router.refresh();
  };

  const shape: CropShape = editing?.kind === 'banner' ? 'banner' : 'circle';

  return (
    <div className="p-pmedia">
      <div className={`p-pmedia-banner${current.banner ? ' has-image' : ''}`} style={current.banner ? { backgroundImage: `url(${current.banner})` } : undefined}>
        <div className="p-pmedia-banner-tools">
          <button className="p-pmedia-chip" type="button" onClick={() => pick('banner')}>
            <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
            {current.banner ? '更换背景' : '添加背景图'}
          </button>
          {current.banner && <button className="p-pmedia-chip" type="button" onClick={() => void remove('banner')}>移除</button>}
        </div>
      </div>
      <div className="p-acct p-pmedia-row">
        <button className={`p-avatar p-pmedia-avatar${current.avatar ? ' p-avatar--art' : ''}`} type="button" style={{ ['--size' as string]: '76px', ['--h' as string]: 28 }} aria-label="更换头像" onClick={() => pick('avatar')}>
          {current.avatar ? <img src={current.avatar} alt="" /> : Array.from(nickname)[0] ?? '我'}
          <span className="p-pmedia-cam" aria-hidden="true">
            <svg className="p-icon" viewBox="0 0 24 24"><path d="M4 7h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /></svg>
          </span>
        </button>
        {children}
      </div>
      <div className="p-pmedia-links">
        <button type="button" onClick={() => pick('avatar')}>{current.avatar ? '更换头像' : '上传头像'}</button>
        {current.avatar && <button type="button" onClick={() => void remove('avatar')}>恢复默认头像</button>}
        <span>支持 PNG、JPG、WebP、GIF，可裁剪、旋转和调色</span>
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(event) => onFile(event.target.files?.[0])} />
      {editing && (
        <ImageCropper
          file={editing.file}
          shape={shape}
          title={editing.kind === 'avatar' ? '编辑头像' : '编辑主页背景'}
          busy={busy}
          error={error}
          onCancel={() => { if (!busy) setEditing(null); }}
          onDone={(blob) => void upload(blob)}
        />
      )}
    </div>
  );
}
