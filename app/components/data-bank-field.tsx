'use client';

import { useEffect, useState } from 'react';

// 聊天 / 群聊设置里的「资料库」一行：这段聊天能用到几份资料 + 去管理
export function DataBankField({ chatId, roomId }: { chatId?: number; roomId?: number }) {
  const [files, setFiles] = useState<{ scope: string }[] | null>(null);
  const query = chatId ? `chatId=${chatId}` : `roomId=${roomId}`;
  useEffect(() => {
    let alive = true;
    void fetch(`/api/data-bank?${query}`, { cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (alive && data?.files) setFiles(data.files);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [query]);
  const own = files?.filter((item) => item.scope === (chatId ? 'chat' : 'room')).length ?? 0;
  const total = files?.length ?? 0;
  return (
    <div className="field cs-books">
      <label>资料库 <small className="pm-st">Data Bank</small></label>
      <div className="cs-book-row">
        <span className="small">{files === null ? '加载中…' : total ? `${total} 份资料生效${own ? `（其中 ${own} 份只属于这里）` : ''}` : '还没有资料'}</span>
        <a className="p-btn p-btn--sm" href={`/me/databank?${chatId ? `chat=${chatId}` : `room=${roomId}`}`}>{total ? '管理' : '添加资料'}</a>
      </div>
      <span className="hint">设定集、长篇背景等文本，生成时自动参考；小的整篇放入，大的按相关度取片段。</span>
    </div>
  );
}
