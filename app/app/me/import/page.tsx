import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function SettingsImportPage() {
  return (
    <section className="p-section" id="import">
      <h2>导入与数据</h2>
      <p>角色卡与对话记录由你自行管理。</p>
      <div className="p-card p-rows">
        <Link className="p-row" href="/plaza">
          <div className="p-row-main"><div className="p-row-title">导入角色卡</div><div className="p-row-sub">支持 SillyTavern V2/V3 JSON 与 PNG 卡</div></div>
          <span className="p-small">去广场导入 →</span>
        </Link>
        <Link className="p-row" href="/chats">
          <div className="p-row-main"><div className="p-row-title">导入聊天记录</div><div className="p-row-sub">SillyTavern .jsonl 与常见 RP 客户端 .json</div></div>
          <span className="p-small">去对话导入 →</span>
        </Link>
        <Link className="p-row" href="/chats">
          <div className="p-row-main"><div className="p-row-title">备份与恢复</div><div className="p-row-sub">每个会话可留 5 份备份，也可导出 txt / jsonl</div></div>
          <span className="p-small">打开对话 →</span>
        </Link>
        <Link className="p-row" href="/terms">
          <div className="p-row-main"><div className="p-row-title">服务条款与隐私政策</div><div className="p-row-sub">仅限 18 周岁以上 · 了解你的数据如何使用</div></div>
          <span className="p-small">查看 →</span>
        </Link>
        <Link className="p-row" href="/guidelines">
          <div className="p-row-main"><div className="p-row-title">社区准则</div><div className="p-row-sub">内容边界、举报与处理方式</div></div>
          <span className="p-small">查看 →</span>
        </Link>
      </div>
    </section>
  );
}
