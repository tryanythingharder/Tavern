import { trMeta } from '@/lib/i18n/runtime';
import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';

export async function generateMetadata(): Promise<Metadata> {
  return trMeta({ title: '社区准则' });
}

export default function GuidelinesPage() {
  return (
    <LegalPage
      title="社区准则"
      meta="最后更新：2026-11-09 · 本页是模板文本，正式上线前需经法务审核"
      notice={<><strong>这是模板文本。</strong>社区准则会随运营情况调整；重大变更会在站内通知。</>}
      footer={<>相关条款：<a href="/terms">服务条款</a> · <a href="/privacy">隐私政策</a></>}
    >
      <h2>允许的</h2>
      <p>原创角色、虚构剧情、日常与冒险、情感向与慢热叙事、成人向的虚构内容（需标记 18+，且不涉及未成年人）。</p>

      <h2>不允许的</h2>
      <p>涉及未成年人的性内容；真实人物的非自愿性内容；违法、暴力煽动、仇恨与骚扰；侵犯版权或隐私；诈骗与冒充；绕过安全机制的提示词攻击。</p>

      <h2>18+ 内容</h2>
      <p>角色与评论可以标记 18+。标记后会在列表里显示提示；你可以在「我的」里选择隐藏 18+ 内容。未标记的成人向内容会被处理。</p>

      <h2>举报与处理</h2>
      <p>角色页、评论和对话消息都可以举报。管理员会按严重程度处理：驳回、下架内容、限制或封禁账号。处理结果会通过站内通知告知举报人。</p>

      <h2>申诉</h2>
      <p>如果你认为处理有误，可以通过站内通知或联系管理员申诉。我们会复核并回复。</p>
    </LegalPage>
  );
}
