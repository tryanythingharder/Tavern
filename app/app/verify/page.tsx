import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPage } from '@/components/auth-page';
import { VerifyForm } from '@/components/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '验证邮箱' });
}

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;

  return (
    <AuthPage kicker="验证邮箱" title="确认是你，再继续。" lead="验证后可以更安全地找回密码，也会收到审核结果通知。">
      {token ? (
        <VerifyForm token={token} />
      ) : (
        <div className="p-auth-form">
          <p className="p-form-error" role="alert">链接缺少令牌，可能不完整。</p>
          <Link className="p-btn p-btn--primary p-auth-button" href="/me">去「我的」重新发送</Link>
        </div>
      )}
    </AuthPage>
  );
}
