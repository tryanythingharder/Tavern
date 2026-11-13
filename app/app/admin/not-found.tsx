import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <main className="page" style={{ maxWidth: 520, paddingTop: 80 }}>
      <p className="eyebrow">ADMIN</p>
      <h1 style={{ margin: '8px 0 6px', fontSize: 30, letterSpacing: '-.02em' }}>没有权限或页面不存在</h1>
      <p className="small">这个后台页面需要管理员权限，或者链接已经失效。</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <Link className="btn btn--sm btn--primary" href="/">返回首页</Link>
        <Link className="btn btn--sm" href="/me">回到我的</Link>
      </div>
    </main>
  );
}
