import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { adminTwoFactorReady, getCurrentUser, isAdminIdentity } from '@/lib/auth';

// 后台统一守卫：身份校验 + 生产可选的管理员 2FA 强制。
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdminIdentity(user)) notFound();
  if (!adminTwoFactorReady(user)) redirect('/me/security?require2fa=1');
  return <>{children}</>;
}
