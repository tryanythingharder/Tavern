import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthPage } from '@/components/auth-page';
import { ResetForm } from '@/components/auth-forms';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '重置密码' });
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;

  return (
    <AuthPage kicker="设置新密码" title="重新推开这扇门。" lead="设置一个新密码。重置成功后，所有旧设备都会退出登录。">
      {token ? (
        <ResetForm token={token} />
      ) : (
        <div className="p-auth-form">
          <p className="p-form-error" role="alert">链接缺少令牌，可能不完整。</p>
          <Link className="p-btn p-btn--primary p-auth-button" href="/forgot">重新申请重置链接</Link>
        </div>
      )}
    </AuthPage>
  );
}
