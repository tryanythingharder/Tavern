import type { CSSProperties } from 'react';
import { builtinArtUrl } from '@/lib/cover-url';

// 角色封面：种子角色有立绘，用户自创角色没有图片，用首字色块兜底（避免 404 图片请求）
export type CoverCharacter = { id: string; name: string; initial: string; hue: number; ownerId: number | null; coverImage?: string | null };

export function CharacterCover({
  character,
  width,
  height,
  rounded = 12,
  fill = false,
  style,
}: {
  character: CoverCharacter;
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
  fill?: boolean;
  style?: CSSProperties;
}) {
  const src = character.coverImage || (character.ownerId === null ? builtinArtUrl(character.id) : null);
  if (src) {
    return (
      <img
        src={src}
        alt={character.name}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        style={{ borderRadius: rounded, objectFit: 'cover', width: fill ? '100%' : width, height: fill ? '100%' : height, ...style }}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={character.name}
      style={{
        width: fill ? '100%' : width,
        height: fill ? '100%' : height,
        borderRadius: rounded,
        display: 'grid',
        placeItems: 'center',
        background: `hsl(${character.hue} 32% 86%)`,
        color: `hsl(${character.hue} 35% 30%)`,
        fontFamily: 'var(--font-serif)',
        fontWeight: 700,
        fontSize: fill ? 44 : typeof width === 'number' ? Math.max(12, width * 0.42) : 16,
        ...style,
      }}
    >
      {character.initial}
    </div>
  );
}
