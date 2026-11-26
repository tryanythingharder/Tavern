import type { CSSProperties } from 'react';
import { coverOriginalUrl, coverThumbUrl } from '@/lib/cover-url';

// 原型封面：.p-cover + 可选 has-portrait；无立绘时用首字色块
export type CoverItem = { id: string; name: string; initial: string; hue: number; ownerId: number | null; coverImage?: string | null };

/** 原图（详情页等大图用） */
export function coverSrc(character: CoverItem): string | null {
  return coverOriginalUrl(character);
}

/** 缩略图（列表卡片、头像用） */
export function coverThumb(character: CoverItem): string | null {
  return coverThumbUrl(character);
}

export function ProtoCover({ character, className = '', style }: { character: CoverItem; className?: string; style?: CSSProperties }) {
  const src = coverThumb(character);
  return (
    <div
      className={`p-cover ${className}${src ? ' has-portrait' : ''}`}
      style={{ ['--h' as string]: character.hue, ...style }}
      data-initial={character.initial}
      role="img"
      aria-label={`${character.name}的立绘`}
    >
      {src && <img src={src} alt="" loading="lazy" decoding="async" width={480} height={720} />}
    </div>
  );
}

// 原型头像：.p-avatar（有图用 p-avatar--art）
export function ProtoAvatar({ character, size = 20 }: { character: CoverItem; size?: number }) {
  const src = coverThumb(character);
  return (
    <span className={`p-avatar${src ? ' p-avatar--art' : ''}`} style={{ ['--size' as string]: `${size}px`, ['--h' as string]: character.hue }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : character.initial}
    </span>
  );
}
