import { fail, json, requireUser } from '@/lib/api';
import { isValidSubscription, pushToUser, removeSubscription, saveSubscription, subscriptionCount, vapidKeys } from '@/lib/web-push';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

// GET /api/me/push —— 公钥（给浏览器订阅用）与当前账号已订阅的设备数
export async function GET() {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  return json({ publicKey: vapidKeys().publicKey, devices: subscriptionCount(user.id) });
}

// POST /api/me/push —— { subscription } 保存本设备订阅；{ test: true } 给自己发一条测试推送
export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { subscription?: unknown; test?: boolean };
  if (body.test) {
    await pushToUser(user.id, { title: '推送已开启', body: '有新作品、点数到账或审核结果时，会在这里提醒你。', link: '/notifications', tag: 'test' });
    return json({ ok: true });
  }
  if (!isValidSubscription(body.subscription)) return fail('订阅信息无效', 400);
  saveSubscription(user.id, body.subscription);
  return json({ ok: true, devices: subscriptionCount(user.id) });
}

// DELETE /api/me/push —— { endpoint } 取消本设备
export async function DELETE(request: Request) {
  const user = await requireUser();
  if (!user) return fail('未登录', 401);
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { endpoint?: string };
  if (body.endpoint) removeSubscription(user.id, String(body.endpoint));
  return json({ ok: true, devices: subscriptionCount(user.id) });
}
