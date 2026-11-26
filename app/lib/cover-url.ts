// 角色封面地址（前后端共用，无依赖）
// - 原图：详情页、大幅头图用
// - 缩略图：列表卡片（广场 / 首页 / 作者页 / 搜索 / 书架 / 会话列表）用，单张 ≤40KB
//   内置卡：/characters/t/<id>.webp（scripts/build-thumbs.mjs 预生成；18+ 的在 private/，由路由判定后给）
//   上传封面：/media/<name>?w=480（media 路由按需缩放并缓存，分级判定与原图一致）
// 缩略图地址带版本号，静态缩略图可长缓存（next.config.mjs）；重新生成缩略图时把版本号加一

import { NARROW_THUMBS } from '@/lib/thumb-widths';

export const THUMB_VERSION = '1';
const THUMB_WIDTH = 480;
const ORIGINAL_WIDTH = 933;
export const MEDIA_THUMB_WIDTH = 480;

type CoverInput = { id: string; coverImage?: string | null; ownerId: number | null };

export function coverOriginalUrl(character: CoverInput): string | null {
  if (character.coverImage) return character.coverImage;
  return character.ownerId === null ? `/characters/${character.id}.jpg` : null;
}

const MEDIA_IMAGE = /^\/media\/[A-Za-z0-9-]+\.(png|jpe?g|webp)$/;

/** 把一张封面原图地址换成缩略图地址；认不出来的（外链、已带参数）原样返回 */
export function thumbOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const builtin = /^\/characters\/([a-z0-9-]+)\.jpg$/.exec(url);
  if (builtin) return `/characters/t/${builtin[1]}.webp?v=${THUMB_VERSION}`;
  if (MEDIA_IMAGE.test(url)) return `${url}?w=${MEDIA_THUMB_WIDTH}`;
  return url;
}

export function coverThumbUrl(character: CoverInput): string | null {
  return thumbOf(coverOriginalUrl(character));
}

/**
 * 中等尺寸的位置（海报、卡堆，显示宽 300–400px）：缩略图 + 原图组成 srcset，配合 sizes，
 * 1x 屏取缩略图，2x 屏才取原图。只对内置立绘给（原图宽 933）；其余返回 null，照常用 src。
 */
export function coverSrcSet(character: CoverInput): string | null {
  const original = coverOriginalUrl(character);
  const match = original ? /^\/characters\/([a-z0-9-]+)\.jpg$/.exec(original) : null;
  if (!original || !match) return null;
  const width = NARROW_THUMBS[match[1]] ?? THUMB_WIDTH;
  return `${thumbOf(original)} ${width}w, ${original} ${ORIGINAL_WIDTH}w`;
}
