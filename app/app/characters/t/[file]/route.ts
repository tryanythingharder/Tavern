import { getCurrentUser } from '@/lib/auth';
import { getCharacterById } from '@/lib/db';
import { nsfwBlock } from '@/lib/age-gate';
import { readThumb } from '@/lib/nsfw-art';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ file: string }> };

// /characters/t/<id>.webp?v=N：内置卡缩略图（scripts/build-thumbs.mjs 生成在 private/characters/t/，不走静态）
// - 全年龄卡：public 长缓存（地址带版本号，重新生成时 THUMB_VERSION 加一）
// - 18+ 卡：与原图同一套 nsfwBlock 判定，游客/未满龄/全站关闭时 403；放行时 private, no-cache, Vary: Cookie
// 缩略图缺失（新加的立绘还没跑脚本）时临时跳到原图地址，原图那边照旧判定。
export async function GET(_request: Request, context: Params) {
  const { file } = await context.params;
  const match = /^([a-z0-9-]+)\.webp$/.exec(file);
  const character = match ? getCharacterById(match[1]) : undefined;
  if (!match || !character || character.owner_id !== null) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const adult = Boolean(character.nsfw);
  if (adult) {
    const user = await getCurrentUser();
    if (await nsfwBlock(user?.id ?? null, character)) {
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }
  const buffer = await readThumb(file);
  if (!buffer) {
    return new Response(null, { status: 302, headers: { Location: `/characters/${match[1]}.jpg`, 'Cache-Control': 'no-store' } });
  }
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(buffer.length),
      // 18+ 按人判定，不能让 CDN/共享缓存存下来再发给别人；全年龄的可长缓存
      ...(adult ? { 'Cache-Control': 'private, no-cache', Vary: 'Cookie' } : { 'Cache-Control': 'public, max-age=31536000, immutable' }),
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
