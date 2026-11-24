import type { ReactNode } from 'react';
import '../../styles/admin.css';
import { notFound, redirect } from 'next/navigation';
import { adminTwoFactorReady, getCurrentUser, isAdminIdentity } from '@/lib/auth';
import { AdminToaster } from '@/components/admin-feedback';

// 后台统一守卫：身份校验 + 生产可选的管理员 2FA 强制。toast 容器挂在这里，所有后台页共用。
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isAdminIdentity(user)) notFound();
  if (!adminTwoFactorReady(user)) redirect('/me/security?require2fa=1');
  return <>{children}<AdminToaster /></>;
}
