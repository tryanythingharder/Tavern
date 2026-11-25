import { convertImagesToWebp, pendingImages } from '@/lib/media-webp';
import { fail, json, requireUser } from '@/lib/api';
import { isAdmin } from '@/lib/auth';
import { deleteSetting, getSetting, setSetting } from '@/lib/settings';
import { logAdmin } from '@/lib/audit';
import { SERVICE_GROUPS, serviceField, serviceSource, serviceValue } from '@/lib/service-config';
import { regenerateVapid, resetVapidCache, vapidStatus } from '@/lib/web-push';
import { sendAlert } from '@/lib/monitor';
import { activeDriver } from '@/lib/storage-drivers';
import { s3Config, s3Delete, s3Put } from '@/lib/storage-drivers/s3';
import { moderationEnabled } from '@/lib/auto-moderation';
import { providerSummary as paymentProviders } from '@/lib/payments';
import { providerSummary as ageProviders } from '@/lib/age-verify';
import { readJson } from '@/lib/body-limit';

export const dynamic = 'force-dynamic';

function status() {
  const groups = SERVICE_GROUPS.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const source = serviceSource(field.key);
      // 密钥只回传来源，不回传值；普通字段回传当前生效值，标出是否来自环境变量
      return { ...field, env: undefined, envName: field.env ?? null, source, value: field.secret ? '' : (source === 'admin' ? getSetting(field.key) : ''), effective: field.secret ? '' : serviceValue(field.key) };
    }),
  }));
  let lastBackup: unknown = null;
  try { lastBackup = JSON.parse(getSetting('backup.lastRun') || 'null'); } catch { lastBackup = null; }
  return {
    groups,
    state: {
      storage: { active: activeDriver().id, s3Ready: Boolean(s3Config()), oldImages: pendingImages().length },
      stripe: { ready: Boolean(serviceValue('payment.stripeKey') && serviceValue('payment.stripeWebhookSecret')), active: paymentProviders().find((item) => item.active)?.id ?? null },
      moderation: { enabled: moderationEnabled() },
      alert: { ready: Boolean(serviceValue('alert.webhook')) },
      backup: { remote: Boolean(serviceValue('backup.endpoint') && serviceValue('backup.bucket') && serviceValue('backup.accessKey') && serviceValue('backup.secretKey')), last: lastBackup },
      push: vapidStatus(),
      ageVerify: { providers: ageProviders() },
    },
  };
}

async function guard() {
  const user = await requireUser();
  if (!user) return { error: fail('未登录', 401) };
  if (!isAdmin(user)) return { error: fail('没有权限', 403) };
  return { user };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return json(status());
}

// PATCH { values: { key: value }, clear: [key] } —— 只接受注册表里的键；空字符串 = 不修改
export async function PATCH(request: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const body = parsedBody as { values?: Record<string, unknown>; clear?: unknown[] };
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(body.values ?? {})) {
    const field = serviceField(key);
    if (!field || typeof raw !== 'string') continue;
    let value = raw.trim();
    if (field.kind === 'switch') value = value === '1' ? '1' : '0';
    if (!value) continue;
    if (field.kind === 'number' && !/^\d{1,4}$/.test(value)) return fail(`「${field.label}」要填整数`, 400);
    if (/^site\.(supportEmail|legalEmail)$/.test(key) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return fail(`「${field.label}」邮箱格式不对`, 400);
    if (/\.(endpoint|url|webhook)$/.test(key) && !/^https?:\/\/\S+$/.test(value)) return fail(`「${field.label}」要以 http:// 或 https:// 开头`, 400);
    if (key === 'site.legalUpdated' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail('日期格式是 YYYY-MM-DD', 400);
    setSetting(key, value);
    changed.push(key);
  }
  for (const key of body.clear ?? []) {
    if (typeof key === 'string' && serviceField(key)) { deleteSetting(key); changed.push(key); }
  }
  if (changed.some((key) => key.startsWith('push.') || key === 'site.supportEmail')) resetVapidCache();
  if (changed.length) logAdmin(g.user.id, '修改站点与服务', [...new Set(changed.map((key) => (serviceField(key)?.secret ? `${key}(密钥)` : key)))].join(', '));
  return json(status());
}

// POST { action } —— 测试连通性 / 重新生成推送密钥
export async function POST(request: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const parsedBody = await readJson(request, {});
  if (parsedBody instanceof Response) return parsedBody;
  const { action } = parsedBody as { action?: string };
  if (action === 'testAlert') {
    const ok = await sendAlert('【夜话】这是一条测试告警，收到说明配置正确。');
    return ok ? json({ ok: true, message: '已发送，去群里看看有没有收到' }) : fail('发送失败：没有填地址，或对方没有返回成功', 400);
  }
  if (action === 'testStorage') {
    if (!s3Config()) return fail('对象存储还没填完整', 400);
    const name = `.yehua-check-${Date.now()}.txt`;
    try {
      await s3Put(name, Buffer.from('ok'), 'text/plain');
      await s3Delete(name);
      return json({ ok: true, message: '读写正常' });
    } catch (error) {
      return fail(`连接失败：${(error as Error).message.slice(0, 160)}`, 400);
    }
  }
  if (action === 'convertWebp') {
    const r = await convertImagesToWebp(100);
    if (r.converted) logAdmin(g.user.id, '旧图转 webp', `${r.converted} 张，省 ${Math.round(r.savedBytes / 1024)} KB`);
    const mb = (r.savedBytes / 1024 / 1024).toFixed(1);
    return json({ ok: true, webp: r, message: r.converted || r.skipped || r.failed ? `转了 ${r.converted} 张，省下 ${mb} MB${r.skipped ? `，${r.skipped} 张转了不更小已跳过` : ''}${r.failed ? `，${r.failed} 张失败：${r.errors[0] ?? ''}` : ''}${r.remaining ? `，还剩 ${r.remaining} 张` : ''}` : '没有需要转换的旧图' });
  }
  if (action === 'regenVapid') {
    if (!regenerateVapid()) return fail('推送密钥由环境变量指定，请在服务器上修改', 400);
    logAdmin(g.user.id, '重新生成推送密钥', '');
    return json({ ok: true, message: '已重新生成，旧订阅已清空', ...status() });
  }
  return fail('未知操作', 400);
}
