import { metaAt, type GenMeta } from '@/lib/msg-meta';
import { reasoningAt, type Reasoning } from '@/lib/reasoning';
import { messageCandidates, type DbMessage } from '@/lib/db';
import { translationFor, type TranslationView } from '@/lib/translation';

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
  /** 玩家消息：发送时的身份名与头像（ST 每条消息的 name / force_avatar） */
  personaName: string | null;
  personaAvatar: string | null;
  /** 当前候选的思考内容（ST 折叠的「思考过程」） */
  thought: Reasoning | null;
  createdAt: number;
  /** ST 隐藏消息（幽灵）：不发给模型、不参与世界书扫描 */
  hidden: boolean;
  /** 当前候选的生成信息（模型 / tokens / 耗时） */
  meta: GenMeta | null;
  /** 当前正文的译文（ST Translate）；original=true 时 text 是玩家写的原话、正文是发给模型的译文 */
  translation: TranslationView | null;
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
    personaName: message.persona_name ?? null,
    personaAvatar: message.persona_avatar ?? null,
    thought: message.role === 'assistant' ? reasoningAt(message.reasoning, message.selected) : null,
    createdAt: message.created_at,
    hidden: message.hidden === 1,
    meta: message.role === 'assistant' ? metaAt(message.meta, message.selected) : null,
    translation: translationFor(message.translations, message.content),
  };
}
