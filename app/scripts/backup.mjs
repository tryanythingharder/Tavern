#!/usr/bin/env node
// 数据库热备份（不依赖 sqlite3 命令行）：VACUUM INTO 生成一致性快照 → gzip → 可选上传。
// 用法：node scripts/backup.mjs     建议 cron：0 3 * * * cd /srv/tavern/app && node scripts/backup.mjs
// 环境变量：
//   TAVERN_BACKUP_DIR         备份目录，默认 .backups
//   TAVERN_BACKUP_KEEP_DAYS   本地保留天数，默认 14
//   TAVERN_BACKUP_UPLOAD_CMD  上传命令，{file} 会替换成备份文件路径，例如
//                             "rclone copy {file} r2:tavern-backups/"  或  "aws s3 cp {file} s3://bucket/tavern/"
// 异地上传优先读后台「站点与服务 → 异地备份」（app_settings 的 backup.*，S3 兼容，零依赖 SigV4），
// 没填才用 TAVERN_BACKUP_UPLOAD_CMD。每次结果写回 backup.lastRun，后台能看到。
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, chmodSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = join(root, '.data', 'tavern.db');
const outDir = process.env.TAVERN_BACKUP_DIR || join(root, '.backups');

function readSettings() {
  try {
    const conn = new DatabaseSync(dbPath, { readOnly: true });
    const rows = conn.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'backup.%'").all();
    conn.close();
    return Object.fromEntries(rows.map((row) => [row.key, String(row.value ?? '').trim()]));
  } catch { return {}; }
}
function record(result) {
  try {
    const conn = new DatabaseSync(dbPath);
    conn.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run('backup.lastRun', JSON.stringify({ at: new Date().toISOString(), ...result }), Date.now());
    conn.close();
  } catch { /* 记录失败不影响备份本身 */ }
}
if (!existsSync(dbPath)) { console.error(`数据库不存在：${dbPath}`); process.exit(1); }
const settings = existsSync(dbPath) ? readSettings() : {};
const keepDays = Number(settings['backup.keepDays'] || process.env.TAVERN_BACKUP_KEEP_DAYS || 14);
const remote = settings['backup.endpoint'] && settings['backup.bucket'] && settings['backup.accessKey'] && settings['backup.secretKey']
  ? { endpoint: settings['backup.endpoint'].replace(/\/$/, ''), bucket: settings['backup.bucket'], accessKey: settings['backup.accessKey'], secretKey: settings['backup.secretKey'], region: settings['backup.region'] || 'auto', prefix: (settings['backup.prefix'] || 'backups/').replace(/^\//, '') }
  : null;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
async function s3Upload(cfg, name, body) {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${cfg.prefix}${name}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { host: url.host, 'content-type': 'application/gzip', 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const path = url.pathname.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/');
  const canonical = ['PUT', path, '', names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, day), cfg.region), 's3'), 'aws4_request');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${createHmac('sha256', key).update(toSign).digest('hex')}`;
  delete headers.host;
  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) throw new Error(`上传 ${name} 失败：HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');


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
let uploaded = false;
try {
  if (remote) {
    for (const file of files) await s3Upload(remote, file.split('/').pop(), readFileSync(file));
    uploaded = true;
  } else if (cmd) {
    for (const file of files) execSync(cmd.replaceAll('{file}', `"${file}"`), { stdio: 'inherit' });
    uploaded = true;
  }
} catch (error) {
  record({ ok: false, uploaded: false, message: String(error?.message ?? error).slice(0, 300) });
  console.error(`备份已生成，但异地上传失败：${error?.message ?? error}`);
  process.exit(2);
}
record({ ok: true, uploaded, files: files.map((file) => file.split('/').pop()) });

const cutoff = Date.now() - keepDays * 86400_000;
for (const name of readdirSync(outDir)) {
  const full = join(outDir, name);
  if (/^(tavern|media)-.*\.gz$/.test(name) && statSync(full).mtimeMs < cutoff) unlinkSync(full);
}
console.log(`备份完成：${files.join(', ')}${uploaded ? '（已上传）' : '（仅本地，正式环境请在后台「站点与服务 → 异地备份」填写对象存储）'}`);
