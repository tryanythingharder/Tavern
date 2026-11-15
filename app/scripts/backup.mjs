#!/usr/bin/env node
// 数据库热备份（不依赖 sqlite3 命令行）：VACUUM INTO 生成一致性快照 → gzip → 可选上传。
// 用法：node scripts/backup.mjs     建议 cron：0 3 * * * cd /srv/tavern/app && node scripts/backup.mjs
// 环境变量：
//   TAVERN_BACKUP_DIR         备份目录，默认 .backups
//   TAVERN_BACKUP_KEEP_DAYS   本地保留天数，默认 14
//   TAVERN_BACKUP_UPLOAD_CMD  上传命令，{file} 会替换成备份文件路径，例如
//                             "rclone copy {file} r2:tavern-backups/"  或  "aws s3 cp {file} s3://bucket/tavern/"
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, '.data', 'tavern.db');
const outDir = process.env.TAVERN_BACKUP_DIR || join(root, '.backups');
const keepDays = Number(process.env.TAVERN_BACKUP_KEEP_DAYS || 14);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

if (!existsSync(dbPath)) { console.error(`数据库不存在：${dbPath}`); process.exit(1); }
mkdirSync(outDir, { recursive: true, mode: 0o700 });

const snapshot = join(outDir, `tavern-${stamp}.db`);
const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
db.close();
await pipeline(createReadStream(snapshot), createGzip({ level: 9 }), createWriteStream(`${snapshot}.gz`, { mode: 0o600 }));
unlinkSync(snapshot);
const files = [`${snapshot}.gz`];

const media = join(root, '.data', 'media');
if (existsSync(media)) {
  const tarFile = join(outDir, `media-${stamp}.tar.gz`);
  execSync(`tar -czf "${tarFile}" -C "${join(root, '.data')}" media`);
  chmodSync(tarFile, 0o600);
  files.push(tarFile);
}

const cmd = process.env.TAVERN_BACKUP_UPLOAD_CMD?.trim();
if (cmd) for (const file of files) execSync(cmd.replaceAll('{file}', `"${file}"`), { stdio: 'inherit' });

const cutoff = Date.now() - keepDays * 86400_000;
for (const name of readdirSync(outDir)) {
  const full = join(outDir, name);
  if (/^(tavern|media)-.*\.gz$/.test(name) && statSync(full).mtimeMs < cutoff) unlinkSync(full);
}
console.log(`备份完成：${files.join(', ')}${cmd ? '（已上传）' : '（仅本地，正式环境请设置 TAVERN_BACKUP_UPLOAD_CMD 做异地备份）'}`);
