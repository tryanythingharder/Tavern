import db from '@/lib/db';
import { fail, json, requireUser } from '@/lib/api';
import { availableModels } from '@/lib/model';

export const dynamic = 'force-dynamic';

// PUT { model } —— 模型广场「设为默认」：之后新开的对话用它；空字符串恢复为站点默认。
export async function PUT(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const body = (await request.json().catch(() => ({}))) as { model?: unknown };
  const wanted = String(body.model ?? '').trim();
  if (wanted && !availableModels().some((item) => item.id === wanted)) return fail('这个模型目前不可用', 400);
  db.prepare('UPDATE users SET default_model = ? WHERE id = ?').run(wanted || null, user.id);
  return json({ ok: true, model: wanted });
}
