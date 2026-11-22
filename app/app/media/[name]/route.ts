import { getCurrentUser } from '@/lib/auth';
import { readMedia } from '@/lib/storage';

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
  if (!file) return new Response('Not found', { status: 404 });
  const privateFile = file.visibility === 'private';
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': TYPES[file.extension] ?? 'application/octet-stream',
      'Cache-Control': privateFile ? 'private, no-store' : 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}
