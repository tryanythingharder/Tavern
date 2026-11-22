import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { AuthPage } from '@/components/auth-page';
import { ForgotForm } from '@/components/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '找回密码' });
}

export default function ForgotPage() {
  return (
    <AuthPage kicker="找回密码" title="忘了密码，也能回来。" lead="输入注册邮箱，我们会发一个 1 小时内有效的重置链接。">
      <ForgotForm />
    </AuthPage>
  );
}
