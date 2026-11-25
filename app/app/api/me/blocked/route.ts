import { fail, json, requireUser } from '@/lib/api';
import { getBlockedAuthors, setBlockedAuthors } from '@/lib/blocked';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ blocked: await getBlockedAuthors() });
}

// POST /api/me/blocked —— { author, blocked }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { author?: string; blocked?: boolean };
  const author = String(body.author ?? '').trim();
  if (!author) return fail('缺少作者', 400);
  const current = await getBlockedAuthors();
  const next = body.blocked === true ? [...current, author] : current.filter((item) => item !== author);
  return json({ blocked: await setBlockedAuthors(next) });
}
