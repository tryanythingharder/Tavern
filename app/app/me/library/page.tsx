import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function SettingsLibraryPage() {
  return (
    <section className="p-section" id="library">
      <h2>角色库与创作</h2>
      <p>管理已添加的角色、你的作品与收藏。</p>
      <div className="p-card p-rows">
        <Link className="p-row" href="/library">
          <div className="p-row-main"><div className="p-row-title">我的角色库</div><div className="p-row-sub">已添加、我创建的、收藏</div></div>
          <span className="p-small">打开 →</span>
        </Link>
        <Link className="p-row" href="/create">
          <div className="p-row-main"><div className="p-row-title">创建角色</div><div className="p-row-sub">先保存私人草稿，再决定是否发布到广场</div></div>
          <span className="p-small">打开 →</span>
        </Link>
        <Link className="p-row" href="/rooms">
          <div className="p-row-main"><div className="p-row-title">多角色房间</div><div className="p-row-sub">让角色在同一个故事中相遇</div></div>
          <span className="p-small">打开 →</span>
        </Link>
      </div>
    </section>
  );
}
