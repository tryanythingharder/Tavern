import { fail, requireUser } from '@/lib/api';
import { exportStPersonas } from '@/lib/resources-db';

export const dynamic = 'force-dynamic';

// GET /api/personas/export —— 导出为 SillyTavern 身份备份格式（头像不含在内，同 ST）
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return new Response(JSON.stringify(exportStPersonas(user.id), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="personas_${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
