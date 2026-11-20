import Link from 'next/link';
import type { ChatBranchInfo } from '@/lib/db';
import { LocalTime } from '@/components/local-time';

// 分支导航（ST 的分支 / 检查点）：从哪里分出来、从这里分出了哪些。服务端渲染，<details> 展开，不需要脚本。
export function ChatBranches({ info, justCreated, base = '/chats' }: { info: ChatBranchInfo; justCreated: boolean; base?: '/chats' | '/rooms' }) {
  const noun = base === '/rooms' ? '房间' : '故事';
  const { parent, children } = info;
  if (!parent && !children.length) return null;
  return (
    <div className="p-branch-note" role={justCreated ? 'status' : undefined} data-branch-bar="">
      {parent ? (
        <span>
          {justCreated ? `已从原${noun}创建分支` : '分支自'}《{parent.title}》{parent.messageIndex > 0 ? ` · 第 ${parent.messageIndex} 条消息` : ''}
        </span>
      ) : (
        <span>这{base === '/rooms' ? '个房间' : '段故事'}有 {children.length} 个分支</span>
      )}
      <span className="p-branch-links">
        {parent && <Link href={`${base}/${parent.id}`}>回到原{noun}</Link>}
        {children.length > 0 && (
          <details className="p-branch-menu">
            <summary>{parent ? `分支 ${children.length}` : '查看'}</summary>
            <ul>
              {children.map((child) => (
                <li key={child.id}>
                  <Link href={`${base}/${child.id}`}>
                    <span className="p-branch-name">{child.checkpoint ? '检查点 · ' : ''}{child.title}</span>
                    <span className="p-branch-meta">第 {child.messageIndex} 条 · <LocalTime value={child.updatedAt} style="mdhm" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </span>
    </div>
  );
}
