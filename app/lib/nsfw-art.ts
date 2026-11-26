import fs from 'node:fs/promises';
import path from 'node:path';
import db from '@/lib/db';

// 18+ 内置卡的立绘不放 public/（静态文件谁都能直链），放 private/characters/<id>.jpg，
// 由 app/characters/[file]/route.ts 按 nsfwBlock 判定后再给。地址仍是 /characters/<id>.jpg，前端各处不用改。
// 全年龄内置卡照旧在 public/characters/，Next 先命中静态文件，不经过这里。

export const PRIVATE_ART_DIR = path.join(process.cwd(), 'private', 'characters');

/** 读私有立绘；文件名不合法或不存在返回 null */
export async function readPrivateArt(file: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+\.jpg$/.test(file)) return null;
  return fs.readFile(path.join(PRIVATE_ART_DIR, file)).catch(() => null);
}

/** 读内置卡缩略图 private/characters/t/<id>.webp（scripts/build-thumbs.mjs 生成，全年龄和 18+ 都在这里）；不存在返回 null */
export async function readThumb(file: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+\.webp$/.test(file)) return null;
  return fs.readFile(path.join(PRIVATE_ART_DIR, 't', file)).catch(() => null);
}

/**
 * 用户上传的 /media/<name> 属于哪张 18+ 卡（封面、头像、表情立绘）。
 * 不属于任何 18+ 卡返回 null；属于多张时只要有一张拦下就拦（交给调用方逐张判）。
 */
export function nsfwOwnersOfMedia(name: string): { nsfw: number; owner_id: number | null }[] {
  const url = `/media/${name}`;
  const rows = db.prepare('SELECT nsfw, owner_id FROM characters WHERE nsfw = 1 AND (cover_image = ? OR avatar_image = ?)').all(url, url) as { nsfw: number; owner_id: number | null }[];
  try {
    const sprites = db.prepare(`
      SELECT c.nsfw, c.owner_id FROM character_sprites s JOIN characters c ON c.id = s.character_id
      WHERE c.nsfw = 1 AND s.src = ?`).all(url) as { nsfw: number; owner_id: number | null }[];
    rows.push(...sprites);
  } catch {
    // 表还没建（没人传过表情立绘）
  }
  return rows;
}
