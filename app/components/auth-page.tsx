import type { ReactNode } from 'react';
import { AuthShell } from '@/components/auth-scene';

// 找回密码 / 重置 / 验证邮箱 / 两步验证共用同一套「门」外壳，表单在画面中央
export function AuthPage({ kicker, title, lead, children }: { kicker: string; title: ReactNode; lead: string; children: ReactNode }) {
  return (
    <AuthShell mode="other" open>
      <section className="p-door-panel" data-layout="single" aria-label="账号操作">
        <p className="p-auth-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="p-auth-lead">{lead}</p>
        {children}
      </section>
    </AuthShell>
  );
}
