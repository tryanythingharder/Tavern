import { getCurrentUser } from '@/lib/auth';
import { getCharacterById } from '@/lib/db';
import { nsfwBlock } from '@/lib/age-gate';
import { readPrivateArt } from '@/lib/nsfw-art';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ file: string }> };

// /characters/<id>.jpg：public/ 里没有的（18+ 内置卡）落到这里，按分级判定后再给图
export async function GET(_request: Request, context: Params) {
  const { file } = await context.params;
  const match = /^([a-z0-9-]+)\.jpg$/.exec(file);
  const character = match ? getCharacterById(match[1]) : undefined;
  if (!character || character.owner_id !== null) return new Response('Not found', { status: 404 });
  const user = await getCurrentUser();
  if (await nsfwBlock(user?.id ?? null, character)) {
    return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const buffer = await readPrivateArt(file);
  if (!buffer) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buffer.length),
      // 按人判定的图：不能让 CDN/共享缓存存下来再发给别人
      'Cache-Control': 'private, no-cache',
      Vary: 'Cookie',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
