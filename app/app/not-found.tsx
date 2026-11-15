import Link from 'next/link';

// 404：三套主题各自用 CSS 换版式与文案（.nf-kicker / .nf-title 的 ::before 由主题提供），默认结构保持简单。
export default function NotFound() {
  return (
    <main className="page nf" style={{ maxWidth: 560, paddingTop: 80 }}>
      <p className="eyebrow nf-kicker">404</p>
      <h1 className="nf-title" style={{ margin: '10px 0 8px', fontSize: 32, letterSpacing: '-.02em' }}>这里没有故事。</h1>
      <p className="small nf-copy">链接可能已经失效，或者这个角色还没有公开。</p>
      <div className="nf-actions" style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <Link className="btn btn--primary" href="/">去发现</Link>
        <Link className="btn" href="/plaza">逛广场</Link>
      </div>
    </main>
  );
}
