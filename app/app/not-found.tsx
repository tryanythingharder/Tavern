import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page" style={{ maxWidth: 520, paddingTop: 80 }}>
      <p className="eyebrow">404</p>
      <h1 style={{ margin: '10px 0 8px', fontSize: 32, letterSpacing: '-.02em' }}>这里没有故事。</h1>
      <p className="small">链接可能已经失效，或者这个角色还没有公开。</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <Link className="btn btn--primary" href="/">去发现</Link>
        <Link className="btn" href="/plaza">逛广场</Link>
      </div>
    </main>
  );
}
