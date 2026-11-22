import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { AuthEntry } from '@/components/auth-entry';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '登录' });
}

// /login 只管登录；旧链接 /login?mode=register、/login?ref=… 转到独立的 /register，参数原样带过去。
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; mode?: string; ref?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const sp = await searchParams;
  if (sp.mode === 'register' || (sp.ref && sp.mode !== 'login')) {
    const q = new URLSearchParams();
    if (sp.ref) q.set('ref', sp.ref);
    if (sp.error) q.set('error', sp.error);
    const s = q.toString();
    redirect('/register' + (s ? `?${s}` : ''));
  }
  return <AuthEntry view="login" open={Boolean(sp.error) || sp.mode === 'login'} error={sp.error} />;
}
