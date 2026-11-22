import Link from 'next/link';
import type { ReactNode } from 'react';

// 法律页：对齐原型 terms.html 的独立版式（不套站内外壳）
export function LegalPage({ title, meta, notice, children, footer, backHref = '/login', backLabel = '返回登录' }: {
  title: string;
  meta: string;
  notice?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="legal">
      <Link className="legal-back" href={backHref}>← {backLabel}</Link>
      <h1>{title}</h1>
      <p className="legal-meta">{meta}</p>
      {notice && <div className="legal-demo">{notice}</div>}
      {children}
      <footer className="legal-footer">{footer ?? '正式上线前，本页需由法务审阅并替换。'}</footer>
    </main>
  );
}
