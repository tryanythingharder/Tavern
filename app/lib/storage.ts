import { randomUUID } from 'node:crypto';
import db from '@/lib/db';
import { reportError } from '@/lib/monitor';
import { activeDriver, localDriver } from '@/lib/storage-drivers';

// 运行时生成的文件（生图、语音、导入的角色卡封面）不能放 public/：
// next start 只服务构建时已知的 public 文件，运行时新写入的会 404。
// 统一通过 /media/[name] 路由读取；实际存在哪由存储驱动决定（lib/storage-drivers）。
// 远端驱动：先写本地（立刻可读），后台上传；成功后删本地副本（TAVERN_STORAGE_KEEP_LOCAL=1 保留做缓存）。
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };

export type MediaMeta = { ownerId?: number; visibility?: 'public' | 'private' };

export function saveMedia(buffer: Buffer, extension: string, meta: MediaMeta = {}): string {
  const name = `${randomUUID()}.${extension}`;
  db.prepare('INSERT INTO media_files (name, owner_id, visibility, created_at) VALUES (?,?,?,?)').run(
    name,
    meta.ownerId ?? null,
    meta.visibility ?? 'public',
    Date.now(),
  );
  const driver = activeDriver();
  const local = localDriver.put(name, buffer, MIME[extension] ?? 'application/octet-stream');
  if (driver.id !== localDriver.id) {
    void local
      .then(() => driver.put(name, buffer, MIME[extension] ?? 'application/octet-stream'))
      .then(() => (process.env.TAVERN_STORAGE_KEEP_LOCAL === '1' ? undefined : localDriver.delete(name)))
      .catch((error: Error) => reportError({ source: 'server', message: `媒体上传到 ${driver.id} 失败（本地副本保留）：${error.message}`, path: 'storage' }));
  } else {
    void local.catch((error: Error) => reportError({ source: 'server', message: `媒体写入失败：${error.message}`, path: 'storage' }));
  }
  return `/media/${name}`;
}

export async function readMedia(name: string, requesterId: number | null = null): Promise<{ buffer: Buffer; extension: string; visibility: 'public' | 'private' } | null> {
  if (!/^[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(name)) return null;
  const row = db.prepare('SELECT owner_id, visibility FROM media_files WHERE name = ?').get(name) as
    | { owner_id: number | null; visibility: string }
    | undefined;
  // 没有登记的历史文件按 public 处理；新写入的聊天媒体是 private，只有本人能读。
  const visibility = row?.visibility === 'private' ? 'private' : 'public';
  if (visibility === 'private' && row?.owner_id !== requesterId) return null;
  const extension = name.split('.').pop() ?? 'bin';
  let buffer = await localDriver.get(name);
  const driver = activeDriver();
  if (!buffer && driver.id !== localDriver.id) buffer = await driver.get(name).catch(() => null);
  return buffer ? { buffer, extension, visibility } : null;
}

export function deleteMediaByOwner(ownerId: number): void {
  const rows = db.prepare('SELECT name FROM media_files WHERE owner_id = ?').all(ownerId) as { name: string }[];
  const driver = activeDriver();
  for (const row of rows) {
    void localDriver.delete(row.name);
    if (driver.id !== localDriver.id) void driver.delete(row.name).catch(() => undefined);
  }
  db.prepare('DELETE FROM media_files WHERE owner_id = ?').run(ownerId);
}
