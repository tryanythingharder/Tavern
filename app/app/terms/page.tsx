import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { legalInfo } from '@/lib/service-config';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '用户协议' });
}

// 条款模板；运营主体、联系邮箱、管辖地在后台「站点与服务」填写，法务审核后打开「已审核」去掉模板提示。
export default function TermsPage() {
  const info = legalInfo();
  const updated = info.updated || '2026-11-09';
  return (
    <LegalPage
      title="用户协议"
      meta={info.reviewed ? `最后更新：${updated}` : `最后更新：${updated} · 本页是模板文本，正式上线前需经法务审核`}
      notice={info.reviewed ? undefined : <><strong>这是模板文本。</strong>正式条款需由法务起草后再替换本页。请在使用前阅读；继续使用即表示你同意以下条款。</>}
      footer={info.legalEmail ? <>对本协议有疑问，请联系 <a href={`mailto:${info.legalEmail}`}>{info.legalEmail}</a>。</> : <>相关问题请联系站点管理员。</>}
    >
      <h2>1. 服务说明</h2>
      <p>夜话提供基于人工智能的角色扮演对话服务。对话内容由模型生成，不代表平台观点，也可能不准确、不完整或不合时宜。你应对自己的使用行为负责。</p>

      <h2>2. 账号与年龄</h2>
      <p>注册即表示你已年满 18 周岁，并具备完全民事行为能力。你应妥善保管账号与密码；账号下的行为视为你本人的行为。</p>

      <h2>3. 用户内容与行为规范</h2>
      <p>你对自己发布的角色、评论与对话内容负责。禁止发布违法内容、侵犯他人权利的内容、骚扰或仇恨内容，以及未经同意披露他人隐私的内容。平台可以依据<a href="/guidelines">社区准则</a>移除内容或限制账号。</p>

      <h2>4. 点数与付费</h2>
      <p>点数用于计量生成消耗，属于虚拟服务额度，不可兑换现金。因平台原因导致的服务中断，我们会按实际情况补回点数；已消耗的点数除法律另有规定外不予退还。</p>

      <h2>5. 免责声明</h2>
      <p>服务按「现状」提供。我们会尽力保证可用性，但不承诺不中断、无错误。因模型供应商、网络或不可抗力导致的中断，平台不承担超出已付费用范围的赔偿责任。</p>

      <h2>6. 变更与终止</h2>
      <p>我们可能更新本条款，重大变更会在站内通知。你可以随时停止使用并申请删除账号；严重违反条款的账号可能被限制或终止。</p>

      {(info.operator || info.legalEmail) && (
        <>
          <h2>7. 运营方与联系方式</h2>
          {info.operator && <p>本服务由 {info.operator} 运营。</p>}
          {info.address && <p>地址：{info.address}</p>}
          {info.legalEmail && <p>联系邮箱：<a href={`mailto:${info.legalEmail}`}>{info.legalEmail}</a></p>}
        </>
      )}

      {info.jurisdiction && (
        <>
          <h2>{info.operator || info.legalEmail ? '8.' : '7.'} 适用法律与争议解决</h2>
          <p>本协议适用 <span>{info.jurisdiction}</span> 的法律。因本协议产生的争议，双方应先友好协商；协商不成的，提交 <span>{info.jurisdiction}</span> 有管辖权的法院解决。</p>
        </>
      )}
    </LegalPage>
  );
}
