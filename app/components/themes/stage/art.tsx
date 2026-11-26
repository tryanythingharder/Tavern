import type { CSSProperties } from 'react';
import { coverSrcSet, coverThumbUrl, coverUrl } from '@/components/themes/types';

export type ArtCharacter = { id: string; name: string; initial: string; ownerId: number | null; coverImage?: string | null };

// 立绘：有图用图；用户自创角色没有图时用墨色底 + 大字首字（不引入额外色相）
// thumb：列表里的小卡用缩略图（≤40KB）；sizes：中等尺寸位置给 srcset（1x 屏缩略图、2x 屏原图）；都不给就是原图（大幅头图）
export function StageArt({ character, className, position, src, thumb = false, sizes }: { character: ArtCharacter; className?: string; position?: string; src?: string | null; thumb?: boolean; sizes?: string }) {
  const url = src === undefined ? (thumb || sizes ? coverThumbUrl(character) : coverUrl(character)) : src;
  const srcSet = src === undefined && sizes ? coverSrcSet(character) : null;
  const style: CSSProperties | undefined = position ? { objectPosition: position } : undefined;
  if (url) return <img className={`stg-art${className ? ` ${className}` : ''}`} src={url} {...(srcSet ? { srcSet, sizes } : {})} alt="" style={style} draggable={false} loading="lazy" decoding="async" />;
  return (
    <span className={`stg-art stg-art--none${className ? ` ${className}` : ''}`} aria-hidden="true">
      <b>{character.initial || Array.from(character.name)[0]}</b>
    </span>
  );
}
