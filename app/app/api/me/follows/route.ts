import { fail, json, requireUser } from '@/lib/api';
import { followedAuthors, setFollow } from '@/lib/follows';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ authors: followedAuthors(user.id) });
}

// POST /api/me/follows —— { author, follow }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { author?: string; follow?: boolean };
  const author = String(body.author ?? '').trim();
  if (!author) return fail('缺少作者', 400);
  return json(setFollow(user.id, author, body.follow === true));
}
