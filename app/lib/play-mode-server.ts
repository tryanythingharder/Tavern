import { cookies } from 'next/headers';
import { PLAY_MODE_COOKIE, parsePlayMode, type PlayMode } from '@/lib/play-mode';

export async function getPlayMode(): Promise<PlayMode | null> {
  const store = await cookies();
  return parsePlayMode(store.get(PLAY_MODE_COOKIE)?.value);
}
