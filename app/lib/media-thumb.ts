import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_THUMB_WIDTH } from '@/lib/cover-url';

// 上传封面的缩略图：/media/<name>?w=480 时按需缩成 webp，缓存到 .data/media-thumb/。
// 分级/私有判定在 media 路由里先做完，这里只管缩图。sharp 不可用或失败返回 null（路由回原图）。
const THUMB_DIR = join(process.cwd(), '.data', 'media-thumb');
const IMAGE = /^[a-zA-Z0-9-]+\.(png|jpe?g|webp)$/;
const inflight = new Map<string, Promise<Buffer | null>>();

export function wantsThumb(name: string, width: string | null): boolean {
  return width === String(MEDIA_THUMB_WIDTH) && IMAGE.test(name);
}

export async function mediaThumb(name: string, original: Buffer): Promise<Buffer | null> {
  const file = join(THUMB_DIR, `${name.replace(/\.[a-z]+$/, '')}-${MEDIA_THUMB_WIDTH}.webp`);
  const cached = await readFile(file).catch(() => null);
  if (cached) return cached;
  const running = inflight.get(file);
  if (running) return running;
  const job = (async () => {
    try {
      const sharp = (await import('sharp')).default;
      const out = await sharp(original, { animated: false }).rotate().resize({ width: MEDIA_THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
      // 原图本来就小（比如已是小图）时缩略图未必更小，那就直接用原图
      if (out.length >= original.length) return null;
      await mkdir(THUMB_DIR, { recursive: true });
      await writeFile(file, out);
      return out;
    } catch {
      return null;
    } finally {
      inflight.delete(file);
    }
  })();
  inflight.set(file, job);
  return job;
}
