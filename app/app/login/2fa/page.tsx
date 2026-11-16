import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/auth-page';
import { TwoFactorLogin } from '@/components/two-factor-login';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '两步验证' });
}

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) redirect('/login?mode=login');
  return (
    <AuthPage kicker="两步验证" title="最后一步。" lead="输入验证器里的 6 位验证码，或使用一次性恢复码。">
      <TwoFactorLogin token={token} />
    </AuthPage>
  );
}
