import { activeProvider } from '@/lib/payments';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AdminHeader } from '@/components/admin-header';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { imageConfig, ttsConfig } from '@/lib/media';
import { getSetting } from '@/lib/settings';
import { pricePerPointCents } from '@/lib/billing';
import { pointsPerThousand } from '@/lib/points';
import { AdminModel } from '@/components/admin-model';
import { modelFallbacks } from '@/lib/model';
import { listChannels } from '@/lib/channels';
import { UnsavedGuard } from '@/components/admin-feedback';

export const dynamic = 'force-dynamic';

function hostOf(value: string): string {
  if (!value) return '未配置';
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return value;
  }
}

function Badge({ ok }: { ok: boolean }) {
  return <span className={`p-pill p-pill--sm ${ok ? 'p-pill--ok' : 'p-pill--warn'}`}>{ok ? '已配置' : '未配置'}</span>;
}

export default async function AdminModelPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const image = imageConfig();
  const tts = ttsConfig();
  const mailKey = Boolean(getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? ''));
  const fallbacks = modelFallbacks().map((route) => ({ baseUrl: route.baseUrl, model: route.model }));
  const channels = listChannels();
  const enabledChannels = channels.filter((channel) => channel.enabled).length;

  return (
    <>
      <AdminHeader href="/admin/model" sub={<>没有渠道时使用的文本模型；生图、语音在「扩展能力」，支付在「计费与增长」</>} actions={<><Link className="p-btn p-btn--sm" href="/admin/settings/billing">点数计费</Link></>} />
      <div className="p-acontent">
        {channels.length > 0 && (
          <div className="p-notice" style={{ marginBottom: 16 }}>
            <div className="p-notice-main">
              <div className="p-notice-title">文本生成已由「渠道」接管</div>
              当前 {enabledChannels} 条启用渠道（共 {channels.length} 条），生成会按优先级依次尝试。这里的单线路与备用线路配置只在没有任何渠道时生效。
            </div>
            <Link className="p-btn p-btn--sm" href="/admin/channels">管理渠道</Link>
          </div>
        )}
        <UnsavedGuard>
        <AdminModel initial={{
          baseUrl: getSetting('model.baseUrl', process.env.TAVERN_MODEL_BASE_URL ?? ''),
          name: getSetting('model.name', process.env.TAVERN_MODEL_NAME ?? ''),
          hasKey: Boolean(getSetting('model.apiKey', process.env.TAVERN_MODEL_API_KEY ?? '')),
          fallbackCount: fallbacks.length,
          fallbackRoutes: fallbacks,
        }} />
        </UnsavedGuard>

        <section className="p-card p-card--pad" style={{ marginTop: 20 }}>
          <h2 className="p-form-section-title">其他网关</h2>
          <div className="p-rows">
            <div className="p-room-card" style={{ padding: '12px 16px' }}>
              <div className="p-room-main"><div className="p-room-title">生图</div><p className="p-room-last">{hostOf(image.baseUrl)} · {image.model || '未配置模型'}</p></div>
              <Badge ok={Boolean(image.baseUrl && image.apiKey && image.model)} />
            </div>
            <div className="p-room-card" style={{ padding: '12px 16px' }}>
              <div className="p-room-main"><div className="p-room-title">语音（TTS）</div><p className="p-room-last">{hostOf(tts.baseUrl)} · {tts.model || '未配置模型'}</p></div>
              <Badge ok={Boolean(tts.baseUrl && tts.apiKey && tts.model)} />
            </div>
            <div className="p-room-card" style={{ padding: '12px 16px' }}>
              <div className="p-room-main"><div className="p-room-title">支付</div><p className="p-room-last">{activeProvider().label} · 每点 {pricePerPointCents()} 分</p></div>
              <Badge ok={Boolean(getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? ''))} />
            </div>
            <div className="p-room-card" style={{ padding: '12px 16px' }}>
              <div className="p-room-main"><div className="p-room-title">邮件</div><p className="p-room-last">{mailKey ? 'Resend 已配置' : '本地 outbox（不真的发信）'}</p></div>
              <Badge ok={mailKey} />
            </div>
          </div>
          <p className="p-hint">文本模型计费：{pointsPerThousand()} 点 / 1000 tokens · <Link href="/admin/settings/billing">去设置计费</Link></p>
        </section>
      </div>
    </>
  );
}
