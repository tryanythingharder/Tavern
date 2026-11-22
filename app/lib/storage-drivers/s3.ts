import { createHash, createHmac } from 'node:crypto';
import type { StorageDriver } from '@/lib/storage-drivers/types';
import { serviceValue } from '@/lib/service-config';

// S3 兼容对象存储（AWS S3 / Cloudflare R2 / Backblaze B2 / MinIO），零依赖 SigV4，path-style。
// 启用：TAVERN_S3_ENDPOINT、TAVERN_S3_BUCKET、TAVERN_S3_ACCESS_KEY、TAVERN_S3_SECRET_KEY，可选 TAVERN_S3_REGION（默认 auto）、TAVERN_S3_PREFIX。
type S3Config = { endpoint: string; bucket: string; region: string; accessKey: string; secretKey: string; prefix: string };

export function s3Config(): S3Config | null {
  const endpoint = serviceValue('s3.endpoint').replace(/\/$/, '');
  const bucket = serviceValue('s3.bucket');
  const accessKey = serviceValue('s3.accessKey');
  const secretKey = serviceValue('s3.secretKey');
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { endpoint, bucket, accessKey, secretKey, region: serviceValue('s3.region') || 'auto', prefix: serviceValue('s3.prefix').replace(/^\//, '') };
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

export function signS3(method: string, cfg: S3Config, key: string, body: Buffer = Buffer.alloc(0), contentType?: string, now = new Date()) {
  const url = new URL(`${cfg.endpoint}/${cfg.bucket}/${cfg.prefix}${key}`);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers: Record<string, string> = { host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  if (contentType) headers['content-type'] = contentType;
  const names = Object.keys(headers).sort();
  const canonicalPath = url.pathname.split('/').map((part) => encodeURIComponent(decodeURIComponent(part))).join('/');
  const canonical = [method, canonicalPath, '', names.map((n) => `${n}:${headers[n]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${cfg.secretKey}`, day), cfg.region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  delete headers.host;
  return { url: url.toString(), headers };
}

export async function s3Put(key: string, body: Buffer, contentType: string): Promise<void> {
  const cfg = s3Config();
  if (!cfg) throw new Error('S3 未配置');
  const { url, headers } = signS3('PUT', cfg, key, body, contentType);
  const res = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function s3Get(key: string): Promise<Buffer | null> {
  const cfg = s3Config();
  if (!cfg) return null;
  const { url, headers } = signS3('GET', cfg, key);
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 GET ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function s3Delete(key: string): Promise<void> {
  const cfg = s3Config();
  if (!cfg) return;
  const { url, headers } = signS3('DELETE', cfg, key);
  await fetch(url, { method: 'DELETE', headers }).catch(() => undefined);
}

export const s3Driver: StorageDriver = {
  id: 's3',
  label: 'S3 兼容对象存储',
  configHint: '在「站点与服务 → 媒体存储」填写，或用 TAVERN_S3_* 环境变量；AWS S3、Cloudflare R2、B2、MinIO 通用',
  configured: () => Boolean(s3Config()),
  put: s3Put,
  get: s3Get,
  delete: s3Delete,
};
