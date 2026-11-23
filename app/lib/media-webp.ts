import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import db from '@/lib/db';
import { activeDriver, localDriver, mediaDir } from '@/lib/storage-drivers';

// 旧图转 webp：把 media_files 里还是 PNG/JPG 的图片转成 webp（体积通常小很多），
// 文件名只换扩展名（<uuid>.png → <uuid>.webp），再把库里所有文本列里的 /media/<uuid>.png 换成新地址。
// 安全措施：
// - 原图先复制到 .data/media-original/ 再删本地；远端存储（S3/R2）上的原图不删，留作回退
// - 转出来不比原图小的跳过
// - /media/<uuid>.png 旧链接在路由里 301 到新地址（浏览器缓存、外部引用不断）
// - 每次最多处理 batch 张，可反复调用直到 remaining = 0

const IMAGE_EXT = /\.(png|jpe?g)$/i;

export type WebpResult = { converted: number; skipped: number; failed: number; savedBytes: number; remaining: number; errors: string[] };

/** 还剩多少张能转（已有同名 webp 的不算） */
export function pendingImages(): { name: string; owner_id: number | null; visibility: string }[] {
  const rows = db.prepare("SELECT name, owner_id, visibility FROM media_files WHERE name LIKE '%.png' OR name LIKE '%.jpg' OR name LIKE '%.jpeg' ORDER BY created_at").all() as { name: string; owner_id: number | null; visibility: string }[];
  const skipped = new Set((db.prepare("SELECT value FROM app_settings WHERE key = 'media.webpSkipped'").get() as { value: string } | undefined)?.value.split(',') ?? []);
  const known = new Set((db.prepare('SELECT name FROM media_files').all() as { name: string }[]).map((row) => row.name));
  // 早期没登记进 media_files 的本地文件（按 public 处理，见 lib/storage.ts readMedia）
  const loose = existsSync(mediaDir) ? readdirSync(mediaDir).filter((name) => IMAGE_EXT.test(name) && /^[a-zA-Z0-9-]+\.[a-z0-9]+$/.test(name) && !known.has(name)).map((name) => ({ name, owner_id: null, visibility: 'public' })) : [];
  return [...rows, ...loose].filter((row) => IMAGE_EXT.test(row.name) && !skipped.has(row.name));
}

function textColumns(): { table: string; column: string }[] {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'media_files'").all() as { name: string }[]).map((row) => row.name);
  const out: { table: string; column: string }[] = [];
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info("${table.replace(/"/g, '')}")`).all() as { name: string; type: string }[];
    for (const col of cols) if (!col.type || /TEXT|CHAR|CLOB/i.test(col.type)) out.push({ table, column: col.name });
  }
  return out;
}

/** 把库里所有文本列中的 from 换成 to（JSON、正文、设置里都换） */
function rewriteReferences(from: string, to: string, columns = textColumns()): number {
  let changed = 0;
  for (const { table, column } of columns) {
    const t = `"${table.replace(/"/g, '')}"`;
    const c = `"${column.replace(/"/g, '')}"`;
    const result = db.prepare(`UPDATE ${t} SET ${c} = REPLACE(${c}, ?, ?) WHERE ${c} LIKE ?`).run(from, to, `%${from}%`);
    changed += Number(result.changes);
  }
  return changed;
}

function markSkipped(name: string) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'media.webpSkipped'").get() as { value: string } | undefined;
  const list = new Set(row?.value.split(',').filter(Boolean) ?? []);
  list.add(name);
  db.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('media.webpSkipped', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run([...list].join(','), Date.now());
}

export async function convertImagesToWebp(batch = 100): Promise<WebpResult> {
  const sharp = (await import('sharp')).default;
  const result: WebpResult = { converted: 0, skipped: 0, failed: 0, savedBytes: 0, remaining: 0, errors: [] };
  const driver = activeDriver();
  const remote = driver.id !== localDriver.id;
  const backupDir = join(process.cwd(), '.data', 'media-original');
  await mkdir(backupDir, { recursive: true });
  const columns = textColumns();
  const todo = pendingImages();

  for (const row of todo.slice(0, batch)) {
    const oldName = row.name;
    const newName = oldName.replace(IMAGE_EXT, '.webp');
    try {
      let buffer = await localDriver.get(oldName);
      if (!buffer && remote) buffer = await driver.get(oldName).catch(() => null);
      if (!buffer) { markSkipped(oldName); result.skipped += 1; continue; }
      const out = await sharp(buffer, { animated: false }).rotate().webp({ quality: 86 }).toBuffer();
      if (out.length >= buffer.length) { markSkipped(oldName); result.skipped += 1; continue; }

      // 先写新文件（本地 + 远端），都成功了再改库
      await localDriver.put(newName, out, 'image/webp');
      if (remote) await driver.put(newName, out, 'image/webp');
      db.exec('BEGIN');
      try {
        db.prepare('INSERT OR IGNORE INTO media_files (name, owner_id, visibility, created_at) SELECT ?, owner_id, visibility, created_at FROM media_files WHERE name = ?').run(newName, oldName);
        rewriteReferences(`/media/${oldName}`, `/media/${newName}`, columns);
        db.prepare('DELETE FROM media_files WHERE name = ?').run(oldName);
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").run(`media.alias.${oldName}`, newName, Date.now());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      // 本地原图挪到备份目录；远端原图不动
      const localOld = join(mediaDir, oldName);
      if (existsSync(localOld)) {
        await copyFile(localOld, join(backupDir, oldName));
        await localDriver.delete(oldName);
      }
      result.converted += 1;
      result.savedBytes += buffer.length - out.length;
    } catch (error) {
      result.failed += 1;
      if (result.errors.length < 5) result.errors.push(`${oldName}：${(error as Error).message.slice(0, 120)}`);
    }
  }
  result.remaining = pendingImages().length;
  return result;
}

/** 旧地址 → 新文件名（转换过的才有） */
export function mediaAlias(name: string): string | null {
  if (!IMAGE_EXT.test(name)) return null;
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(`media.alias.${name}`) as { value: string } | undefined;
  return row?.value ?? null;
}
