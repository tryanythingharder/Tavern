import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { serviceValue } from '@/lib/service-config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '帮助与申诉' });
}

export default function SupportPage() {
  const email = serviceValue('site.supportEmail');
  return (
    <LegalPage
      title="帮助与申诉"
      meta="账号、充值、内容处理与数据权利"
      notice={<><strong>需要人工处理？</strong>请尽量附上账号邮箱、订单号或内容链接，方便快速定位。</>}
      footer={<>返回 <a href="/">夜话首页</a> · <a href="/guidelines">社区准则</a></>}
      backHref="/"
      backLabel="返回首页"
    >
      <h2>联系我们</h2>
      {email ? (
        <p>支持邮箱：<a href={`mailto:${email}`}>{email}</a>。我们会在工作日 48 小时内回复。</p>
      ) : (
        <p>站点尚未配置公开支持邮箱。请通过站内举报入口提交内容问题；账号与充值问题请联系部署这个站点的管理员。</p>
      )}

      <h2>账号与登录</h2>
      <p>忘记密码可以在登录页使用「忘记密码」；如果邮箱已无法使用，请用注册邮箱联系支持并提供可验证信息。管理员不会向你索要密码或验证码。</p>

      <h2>充值与订单</h2>
      <p>订单到账、退款或点数异常，请提供订单号、充值时间和账号邮箱。未支付订单不会扣款；已到账订单的退款需按支付渠道规则处理。</p>

      <h2>内容举报与申诉</h2>
      <p>角色页、评论和对话消息都可以举报。举报处理结果会通过站内通知告知。如果你认为处理有误，可以回复通知或通过上面的支持邮箱申诉，并附上内容链接。</p>

      <h2>数据导出与注销</h2>
      <p>在「我的 · 安全与隐私」可以导出数据或注销账号。注销后个人内容会被删除或匿名化，法律要求保留的账务记录会按最短期限保留。</p>
    </LegalPage>
  );
}
