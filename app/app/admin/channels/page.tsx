import { notFound, redirect } from 'next/navigation';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { listChannels, publicChannel } from '@/lib/channels';
import { imageConfig, ttsConfig } from '@/lib/media';
import { getSetting } from '@/lib/settings';
import { AdminChannels } from '@/components/admin-channels';

export const dynamic = 'force-dynamic';

function hostOf(value: string): string {
  if (!value) return '—';
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}

export default async function AdminChannelsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdmin(user)) notFound();
  const image = imageConfig();
  const tts = ttsConfig();
  const initial = listChannels().map(publicChannel);
  const others = [
    { name: '生图', endpoint: hostOf(image.baseUrl), model: image.model, ok: Boolean(image.baseUrl && image.apiKey && image.model), href: '/admin/settings', kind: 'image' as const },
    { name: '语音（TTS）', endpoint: hostOf(tts.baseUrl), model: tts.model, ok: Boolean(tts.baseUrl && tts.apiKey && tts.model), href: '/admin/settings', kind: 'tts' as const },
    { name: '支付', endpoint: getSetting('payment.provider', '手动确认'), model: getSetting('payment.checkoutUrl', '未配置结算页'), ok: Boolean(getSetting('payment.secret', process.env.TAVERN_PAYMENT_SECRET ?? '')), href: '/admin/settings', kind: 'payment' as const },
    { name: '邮件', endpoint: getSetting('mail.from', '未配置发件人'), model: 'Resend', ok: Boolean(getSetting('mail.resend_key', process.env.TAVERN_MAIL_RESEND_KEY ?? '')), href: '/admin/settings', kind: 'mail' as const },
  ];

  return (
    <>
      <header className="p-atoolbar">
        <div>
          <h1>渠道</h1>
          <div className="p-atoolbar-sub">文本渠道支持多条、按优先级 failover；模型从上游拉取，不用手填</div>
        </div>
      </header>
      <div className="p-acontent">
        <AdminChannels initial={initial} others={others} />
      </div>
    </>
  );
}
