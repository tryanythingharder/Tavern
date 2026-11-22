import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth-page';
import { EmailChangeVerify } from '@/components/email-change-verify';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '确认新邮箱' });
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect('/login?mode=login');
  return (
    <AuthPage kicker="更换邮箱" title="确认你的新邮箱。" lead="确认后旧邮箱会失效，所有设备需要重新登录。">
      <EmailChangeVerify token={token} />
    </AuthPage>
  );
}
