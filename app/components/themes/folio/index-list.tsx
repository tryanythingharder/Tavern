'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type FolioIndexItem = {
  id: string;
  name: string;
  author: string;
  category: string;
  hook: string;
  chats: string;
  nsfw: boolean;
  pace: string;
  cover: string | null;
  initial: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

// 本期角色：左侧目录筛选 + 中间编号目录 + 右侧悬停取出的书封
export function FolioIndex({
  items,
  categories,
  tags,
  theme,
  issueNo,
}: {
  items: FolioIndexItem[];
  categories: { name: string; count: number }[];
  tags: string[];
  theme: string | null;
  issueNo: string;
}) {
  const [cat, setCat] = useState<string>('全部');
  const visible = useMemo(() => items.map((item, i) => ({ item, n: i + 1 })).filter(({ item }) => cat === '全部' || item.category === cat), [items, cat]);
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const current = visible.some(({ item }) => item.id === active) ? active : visible[0]?.item.id ?? null;

  const choose = (name: string) => {
    setCat(name);
    const first = items.find((item) => name === '全部' || item.category === name);
    setActive(first?.id ?? null);
  };

  return (
    <div className="fo-index">
      <aside className="fo-itoc fo-reveal" aria-label="目录">
        <h4><span>目录</span><span className="fo-it">Contents</span></h4>
        <ul>
          {[{ name: '全部', count: items.length }, ...categories].map((entry) => (
            <li key={entry.name}>
              <button type="button" className={cat === entry.name ? 'is-on' : undefined} aria-pressed={cat === entry.name} onClick={() => choose(entry.name)}>
                <span className="fo-mk" aria-hidden="true">→</span>
                <span className="fo-zh">{entry.name}</span>
                <span className="fo-dots" aria-hidden="true" />
                <span className="fo-pg">{pad(entry.count)}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="fo-inote">本期编者按：{theme ? <><b>{theme}</b>是这一期的共同气质——</> : null}每个故事都留了一段空白，等你来填。</p>
        {tags.length > 0 && (
          <div className="fo-tags">
            {tags.map((tag) => <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`}>{tag}</Link>)}
          </div>
        )}
      </aside>

      <ol className="fo-list">
        {visible.map(({ item, n }, i) => (
          <li
            key={item.id}
            className="fo-row fo-reveal"
            data-on={current === item.id ? '' : undefined}
            style={{ ['--d' as string]: i * 90 }}
            onMouseEnter={() => setActive(item.id)}
            onFocus={() => setActive(item.id)}
          >
            <Link href={`/c/${item.id}`}>
              <span className="fo-no">{pad(n)}</span>
              <div className="fo-row-main">
                <div className="fo-nm"><h3>{item.name}</h3><span className="fo-by">文 / {item.author}</span></div>
                <p className="fo-hook">{item.hook}</p>
              </div>
              <div className="fo-meta">
                <span className="fo-cat">{item.category}</span>
                <span className="fo-cnt">{item.chats} 次对话</span>
                {item.nsfw && <span className="fo-r18">18+</span>}
              </div>
            </Link>
            <span className="fo-arr" aria-hidden="true">翻开 →</span>
          </li>
        ))}
        {!visible.length && <li className="fo-row fo-row--empty">这一栏目还没有稿件。</li>}
      </ol>

      <div className="fo-jacket-col" aria-hidden="true">
        <div className="fo-jacket-stage">
          {visible.map(({ item, n }) => (
            <div key={item.id} className={`fo-jacket${current === item.id ? ' is-show' : ''}`}>
              <div className="fo-spine"><i>{pad(n)}</i><b>{item.name}</b><i>N°{Number(issueNo)}</i></div>
              <div className="fo-face">
                {item.cover ? <img src={item.cover} alt="" loading="lazy" decoding="async" /> : <span className="fo-face-initial">{item.initial}</span>}
                <div className="fo-top"><span>No.{pad(n)}</span><span>{item.category}</span></div>
                <div className="fo-cap">
                  {item.pace && <div className="fo-k">{item.pace}</div>}
                  <h5>{item.name}</h5>
                  <p>{item.hook}</p>
                </div>
              </div>
            </div>
          ))}
          <span className="fo-jacket-hint">悬停目录，取出书封</span>
        </div>
      </div>
    </div>
  );
}
