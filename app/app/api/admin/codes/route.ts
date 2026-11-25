import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { createCodes, listCodes } from '@/lib/billing';
import { logAdmin } from '@/lib/audit';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/admin/codes —— 最近的兑换码
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  return json({ codes: listCodes(50) });
}

// POST /api/admin/codes —— { amount, count, note } 生成一批兑换码
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  if (!isAdmin(user)) return fail('没有权限', 403);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { amount?: number; count?: number; note?: string };
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail('点数不对', 400);
  const codes = createCodes(user.id, amount, Number(body.count ?? 1), String(body.note ?? ''));
  logAdmin(user.id, '生成兑换码', `${codes.length} 个 · 每个 ${amount} 点`);
  return json({ codes }, 201);
}
