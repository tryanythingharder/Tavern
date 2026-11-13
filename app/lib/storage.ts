import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import db from '@/lib/db';

// 运行时生成的文件（生图、语音、导入的角色卡封面）不能放 public/：
// next start 只服务构建时已知的 public 文件，运行时新写入的会 404。
// 统一存到 .data/media，通过 /media/[name] 路由读取。
const mediaDir = join(process.cwd(), '.data', 'media');

export type MediaMeta = { ownerId?: number; visibility?: 'public' | 'private' };

export function saveMedia(buffer: Buffer, extension: string, meta: MediaMeta = {}): string {
  mkdirSync(mediaDir, { recursive: true });
  const name = `${randomUUID()}.${extension}`;
  writeFileSync(join(mediaDir, name), buffer);
  db.prepare('INSERT INTO media_files (name, owner_id, visibility, created_at) VALUES (?,?,?,?)').run(
    name,
    meta.ownerId ?? null,
    meta.visibility ?? 'public',
    Date.now(),
  );
  return `/media/${name}`;
}

export function readMedia(name: string, requesterId: number | null = null): { buffer: Buffer; extension: string; visibility: 'public' | 'private' } | null {
  if (!/^[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(name)) return null;
  const row = db.prepare('SELECT owner_id, visibility FROM media_files WHERE name = ?').get(name) as
    | { owner_id: number | null; visibility: string }
    | undefined;
  // 没有登记的历史文件按 public 处理；新写入的聊天媒体是 private，只有本人能读。
  const visibility = row?.visibility === 'private' ? 'private' : 'public';
  if (visibility === 'private' && row?.owner_id !== requesterId) return null;
  try {
    const buffer = readFileSync(join(mediaDir, name));
    return { buffer, extension: name.split('.').pop() ?? 'bin', visibility };
  } catch {
    return null;
  }
}

export function deleteMediaByOwner(ownerId: number): void {
  const rows = db.prepare('SELECT name FROM media_files WHERE owner_id = ?').all(ownerId) as { name: string }[];
  for (const row of rows) {
    try {
      unlinkSync(join(mediaDir, row.name));
    } catch {
      // 文件已经不在了
    }
  }
  db.prepare('DELETE FROM media_files WHERE owner_id = ?').run(ownerId);
}
