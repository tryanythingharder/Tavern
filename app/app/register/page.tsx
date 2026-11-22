import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthEntry } from '@/components/auth-entry';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '注册' });
}

// 独立注册页：直接打开就是注册表单（门已推开）；好友链接 /register?ref=R-XXXXXX 自动锁定邀请码。
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; ref?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const { error, ref } = await searchParams;
  return <AuthEntry view="register" open error={error} refParam={ref} />;
}
