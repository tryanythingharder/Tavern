import Link from 'next/link';
import type { CreatorStats } from '@/lib/creator-stats';

const STATUS: Record<string, string> = { published: '已发布', pending: '待审核', draft: '草稿', archived: '已下架', rejected: '未通过' };

function fmt(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000) / 10}万` : String(n);
}

export function CreatorStatsView({ stats }: { stats: CreatorStats }) {
  const { totals, daily, works, days } = stats;
  const peak = Math.max(1, ...daily.map((d) => d.chats));
  const tiles: [string, number, string][] = [
    ['玩家', totals.players, `近 ${days} 天新玩家 ${totals.newPlayers}`],
    ['对话', totals.chats, `近 ${days} 天新开 ${totals.newChats}`],
    ['玩家发言', totals.playerMessages, '所有作品累计'],
    ['收藏', totals.favorites, `近 ${days} 天新增 ${totals.newFavorites}`],
    ['评论', totals.comments, '公开可见的评论'],
    ['关注你', totals.followers, '作品首发时会收到通知'],
  ];
  const range = (n: 7 | 30) => (
    <Link href={n === 7 ? '/create?tab=stats' : '/create?tab=stats&days=30'} role="tab" aria-selected={days === n}>{`近 ${n} 天`}</Link>
  );

  return (
    <div className="cs" data-days={days}>
      <div className="p-filterbar">
        <div className="p-tabs" role="tablist" aria-label="时间范围">{range(7)}{range(30)}</div>
      </div>

      <div className="cs-tiles">
        {tiles.map(([label, value, sub]) => (
          <div className="p-card cs-tile" key={label}>
            <div className="cs-tile-label">{label}</div>
            <div className="cs-tile-value">{fmt(value)}</div>
            <div className="cs-tile-sub">{sub}</div>
          </div>
        ))}
      </div>

      <section className="p-card p-card--pad cs-chart" aria-labelledby="cs-chart-title">
        <h2 className="p-form-section-title" id="cs-chart-title">每天新开的对话</h2>
        <p className="p-small">不含你自己测试开的对话。</p>
        <div className="cs-bars" role="img" aria-label={`近 ${days} 天每天新开的对话`}>
          {daily.map((d) => (
            <div className="cs-bar" key={d.day} title={`${d.day} · ${d.chats} · ${d.messages}`}>
              <span className="cs-bar-n">{d.chats || ''}</span>
              <span className="cs-bar-fill" style={{ height: `${Math.max(d.chats ? 4 : 0, (d.chats / peak) * 82)}%` }} />
              <span className="cs-bar-day">{d.day.slice(5).replace('-', '/')}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="p-card cs-table-wrap" aria-labelledby="cs-works-title">
        <h2 className="p-form-section-title" id="cs-works-title" style={{ padding: '18px 20px 0' }}>每个作品</h2>
        {works.length ? (
          <div className="cs-scroll">
            <table className="cs-table">
              <thead>
                <tr><th>作品</th><th>状态</th><th>{`近 ${days} 天新对话`}</th><th>玩家</th><th>对话</th><th>平均轮数</th><th>收藏</th><th>评论</th><th aria-label="操作" /></tr>
              </thead>
              <tbody>
                {works.map((w) => (
                  <tr key={w.id}>
                    <td className="cs-name" data-no-i18n="">{w.name}</td>
                    <td><span className="p-pill p-pill--sm p-pill--outline">{STATUS[w.status] ?? w.status}</span></td>
                    <td>{w.newChats}</td><td>{w.players}</td><td>{w.chats}</td><td>{w.avgTurns}</td><td>{w.favorites}</td><td>{w.comments}</td>
                    <td><Link className="p-btn p-btn--sm p-btn--ghost" href={`/create?edit=${w.id}`}>编辑</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-empty">
            <div className="p-empty-title">还没有作品</div>
            <p className="p-empty-text">发布第一个角色后，这里会显示有多少人在玩。</p>
            <Link className="p-btn p-btn--primary" href="/create">创建角色</Link>
          </div>
        )}
      </section>
    </div>
  );
}
