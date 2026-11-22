import { fail, json, requireUser } from '@/lib/api';
import { nsfwBlock, roomNsfwBlock } from '@/lib/age-gate';
import { createRoom, listRooms } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ rooms: listRooms(user.id) });
}

// POST /api/rooms —— { name, characterIds, strategy }
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { name?: string; characterIds?: unknown; strategy?: string };
  const blocked18 = await roomNsfwBlock(user.id, body.characterIds);
  if (blocked18) return fail(blocked18, 403);
  const room = createRoom(user.id, body);
  if (!room) return fail('至少选一个角色', 400);
  return json({ room }, 201);
}
