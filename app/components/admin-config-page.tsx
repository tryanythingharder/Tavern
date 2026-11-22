import Link from 'next/link';
import type { ReactNode } from 'react';
import { ADMIN_GUIDES } from '@/lib/admin-guides';
import { navItem } from '@/lib/admin-nav';

// 配置类子页的统一骨架：面包屑 + 标题 + 表单 + 右侧使用说明 + 同分类其它页
export function AdminConfigPage({ href, guide, children }: { href: string; guide: string; children: ReactNode }) {
  const found = navItem(href);
  const info = ADMIN_GUIDES[guide];
  const siblings = found ? found.group.items.filter((item) => item.href !== href) : [];
  return (
    <>
      <header className="p-atoolbar">
        <div>
          {found && <div className="p-acrumb"><span>{found.group.label}</span><span aria-hidden="true">›</span><span>{found.item.label}</span></div>}
          <h1>{found?.item.label ?? ''}</h1>
          {found?.item.desc && <div className="p-atoolbar-sub">{found.item.desc}</div>}
        </div>
      </header>
      <div className="p-acontent">
        <div className="p-aconfig">
          <div>
            {children}
          </div>
          {info && (
            <aside className="p-card p-card--pad p-aguide" aria-label="使用说明">
              <h2>使用说明</h2>
              <p>{info.what}</p>
              <h3>怎么配置</h3>
              <ol>{info.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {info.fields && info.fields.length > 0 && (
                <>
                  <h3>字段说明</h3>
                  <dl>{info.fields.map(([name, desc]) => <div key={name}><dt>{name}</dt><dd>{desc}</dd></div>)}</dl>
                </>
              )}
              {info.faq && info.faq.length > 0 && (
                <>
                  <h3>常见问题</h3>
                  {info.faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
                </>
              )}
            </aside>
          )}
        </div>
        {siblings.length > 0 && (
              <section className="p-card p-card--pad p-asibling-card" style={{ marginTop: 16 }}>
                <h2 className="p-form-section-title" style={{ margin: 0 }}>{found?.group.label}里的其它设置</h2>
                <div className="p-asiblings">
                  {siblings.map((item) => <Link key={item.href} href={item.href}>{item.label}{item.desc && <small>{item.desc}</small>}</Link>)}
                </div>
              </section>
            )}
      </div>
    </>
  );
}
