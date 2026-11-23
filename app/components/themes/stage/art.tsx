import type { CSSProperties } from 'react';
import { coverUrl } from '@/components/themes/types';

export type ArtCharacter = { id: string; name: string; initial: string; ownerId: number | null; coverImage?: string | null };

// 立绘：有图用图；用户自创角色没有图时用墨色底 + 大字首字（不引入额外色相）
export function StageArt({ character, className, position, src }: { character: ArtCharacter; className?: string; position?: string; src?: string | null }) {
  const url = src === undefined ? coverUrl(character) : src;
  const style: CSSProperties | undefined = position ? { objectPosition: position } : undefined;
  if (url) return <img className={`stg-art${className ? ` ${className}` : ''}`} src={url} alt="" style={style} draggable={false} loading="lazy" decoding="async" />;
  return (
    <span className={`stg-art stg-art--none${className ? ` ${className}` : ''}`} aria-hidden="true">
      <b>{character.initial || Array.from(character.name)[0]}</b>
    </span>
  );
}
