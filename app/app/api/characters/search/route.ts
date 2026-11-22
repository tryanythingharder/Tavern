import { json } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { searchCharacterViews } from '@/lib/characters';
import { nsfwAccess } from '@/lib/age-gate';

export const dynamic = 'force-dynamic';

// GET /api/characters/search?q= —— 命令面板用的轻量角色搜索（最多 6 条）
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 40);
  if (!q.trim()) return json({ characters: [] });
  const user = await getCurrentUser();
  const list = searchCharacterViews(q, { hideNsfw: !(await nsfwAccess(user?.id ?? null)).show, sort: 'hot' }).slice(0, 6);
  return json({ characters: list.map((c) => ({ id: c.id, name: c.name, hook: c.hook })) });
}
