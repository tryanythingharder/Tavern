import { getCurrentUser } from '@/lib/auth';
import { readMedia } from '@/lib/storage';
import { mediaAlias } from '@/lib/media-webp';
import { parseRange } from '@/lib/http-range';
import { nsfwBlock } from '@/lib/age-gate';
import { nsfwOwnersOfMedia } from '@/lib/nsfw-art';

export const dynamic = 'force-dynamic';

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

type Params = { params: Promise<{ name: string }> };

export async function GET(request: Request, context: Params) {
  const { name } = await context.params;
  const user = await getCurrentUser();
  const file = await readMedia(name, user?.id ?? null);
  if (!file) {
    // 转成 webp 的旧图：旧链接永久跳到新地址
    const alias = mediaAlias(name);
    if (alias) return new Response(null, { status: 301, headers: { Location: `/media/${alias}`, 'Cache-Control': 'public, max-age=31536000' } });
    return new Response('Not found', { status: 404 });
  }
  // 18+ 卡的封面/头像/表情立绘：上传时是 public，但不能靠直链绕过分级
  const nsfwOwners = nsfwOwnersOfMedia(name);
  for (const owner of nsfwOwners) {
    if (await nsfwBlock(user?.id ?? null, owner)) return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const privateFile = file.visibility === 'private' || nsfwOwners.length > 0;
  const size = file.buffer.length;
  const headers: Record<string, string> = {
    'Content-Type': TYPES[file.extension] ?? 'application/octet-stream',
    // 18+ 图按人判定，浏览器也要每次回来问（年龄状态、全站开关会变）
    'Cache-Control': nsfwOwners.length ? 'private, no-cache' : privateFile ? 'private, max-age=31536000, immutable' : 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Accept-Ranges': 'bytes',
  };
  // 音频拖动 / 断点续传：单段 Range 回 206，取不到回 416，认不出来的按规范忽略回整份
  const range = parseRange(request.headers.get('range'), size);
  if (range === 'unsatisfiable') {
    return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}`, 'Content-Length': '0' } });
  }
  if (range) {
    const chunk = file.buffer.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': String(chunk.length) },
    });
  }
  return new Response(new Uint8Array(file.buffer), { headers: { ...headers, 'Content-Length': String(size) } });
}
