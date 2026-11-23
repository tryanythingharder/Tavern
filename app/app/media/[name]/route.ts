import { getCurrentUser } from '@/lib/auth';
import { readMedia } from '@/lib/storage';
import { mediaAlias } from '@/lib/media-webp';

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

export async function GET(_request: Request, context: Params) {
  const { name } = await context.params;
  const user = await getCurrentUser();
  const file = await readMedia(name, user?.id ?? null);
  if (!file) {
    // 转成 webp 的旧图：旧链接永久跳到新地址
    const alias = mediaAlias(name);
    if (alias) return new Response(null, { status: 301, headers: { Location: `/media/${alias}`, 'Cache-Control': 'public, max-age=31536000' } });
    return new Response('Not found', { status: 404 });
  }
  const privateFile = file.visibility === 'private';
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': TYPES[file.extension] ?? 'application/octet-stream',
      'Cache-Control': privateFile ? 'private, max-age=31536000, immutable' : 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
