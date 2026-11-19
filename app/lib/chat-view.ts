import { messageCandidates, type DbMessage } from '@/lib/db';

// 客户端需要的消息视图：正文 + 候选数量（>1 才显示切换）。
export type ChatAttachment = { kind: 'image' | 'audio'; url: string; prompt?: string; createdAt: number };

export type ChatMessageView = {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  candidateCount: number;
  selected: number;
  bookmark: boolean;
  checkpoint: number | null;
  attachment: ChatAttachment | null;
  createdAt: number;
};

function parseAttachment(raw: string | null): ChatAttachment | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ChatAttachment>;
    if (!value || typeof value.url !== 'string') return null;
    return {
      kind: value.kind === 'audio' ? 'audio' : 'image',
      url: value.url,
      prompt: typeof value.prompt === 'string' ? value.prompt : undefined,
      createdAt: Number(value.createdAt) || 0,
    };
  } catch {
    return null;
  }
}

export function toMessageView(message: DbMessage): ChatMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    candidateCount: messageCandidates(message).length,
    selected: message.selected,
    bookmark: message.bookmark === 1,
    checkpoint: message.checkpoint_chat_id ?? null,
    attachment: parseAttachment(message.attachment),
    createdAt: message.created_at,
  };
}
