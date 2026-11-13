'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/components/settings-ui';

type Item = { id: number; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: number };

const ICONS: Record<string, string> = {
  points: 'M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3',
  moderation: 'M12 3 4 7v6c0 4 3.4 7.4 8 8 4.6-.6 8-4 8-8V7z',
  system: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0',
  reply: 'M20 12a7 7 0 0 1-7 7H8l-4 3v-4.6A7 7 0 0 1 8 5h5a7 7 0 0 1 7 7z',
};

function iconFor(type: string) {
  return (
    <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={ICONS[type] ?? ICONS.system} />
    </svg>
  );
}

// 原型列表用相对时间（10 分钟前 / 2 小时前），超过一周才显示日期
function relative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function NotificationsList({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

  const unread = items.filter((item) => !item.read).length;
  const list = useMemo(() => (filter === 'all' ? items : items.filter((item) => !item.read)), [items, filter]);

  const readAll = async () => {
    setBusy(true);
    try {
      await api('/api/notifications/read', { method: 'POST' });
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="p-page-title">
        <div>
          <h1>通知</h1>
          <p>评论、作品版本、审核和系统提醒。</p>
        </div>
        <div className="p-page-title-actions">
          <button className="p-btn" type="button" disabled={busy || unread === 0} onClick={() => void readAll()}>全部标为已读</button>
        </div>
      </header>

      <div className="p-tabs" role="tablist" aria-label="通知筛选">
        <button role="tab" type="button" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>全部</button>
        <button role="tab" type="button" aria-selected={filter === 'unread'} onClick={() => setFilter('unread')}>
          未读{unread > 0 ? ` · ${unread}` : ''}
        </button>
      </div>

      <div className="p-notification-list">
        {list.map((item) => {
          const content = (
            <>
              <span className="p-notification-icon">{iconFor(item.type)}</span>
              <span className="p-notification-main">
                <span className="p-notification-title">
                  {item.title}
                  {!item.read && <span className="p-unread-dot" aria-label="未读" />}
                </span>
                {item.body && <span className="p-notification-text">{item.body}</span>}
                <span className="p-notification-time">{relative(item.createdAt)}</span>
              </span>
              <svg className="p-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </>
          );
          return item.link ? (
            <a key={item.id} className={`p-notification-row${item.read ? '' : ' is-unread'}`} href={item.link}>{content}</a>
          ) : (
            <div key={item.id} className={`p-notification-row${item.read ? '' : ' is-unread'}`}>{content}</div>
          );
        })}

        {!list.length && (
          <div className="p-empty">
            <div className="p-empty-icon">{iconFor('system')}</div>
            <div className="p-empty-title">{filter === 'unread' ? '没有未读通知' : '暂时没有通知'}</div>
            <p className="p-empty-text">评论、版本更新和审核结果会出现在这里。</p>
          </div>
        )}
      </div>
    </>
  );
}
