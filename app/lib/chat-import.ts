// 聊天记录导入：兼容 SillyTavern .jsonl（含候选/系统消息）、本站导出的 .jsonl，
// 以及 Agnai / oobabooga / RisuAI / CAI Tools 常见 .json 结构。
export type ImportedMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  candidates?: string[];
  selected?: number;
  hidden?: boolean;
  /** ST extra.reasoning（当前候选的思考内容） */
  reasoning?: { t: string; ms: number };
};

export type ParsedChatImport = {
  title: string;
  messages: ImportedMessage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  // Chub 的 mes / swipes 可能是 { message } 对象
  if (isRecord(value) && typeof value.message === 'string') return value.message;
  return '';
}

function roleOf(value: unknown): 'user' | 'assistant' | 'system' {
  return value === 'user' || value === 'system' ? value : 'assistant';
}

// 单条消息：支持 {role,content}、{is_user,mes}、{userId,msg}、{src:{is_human},text}
function messageFrom(item: unknown): ImportedMessage | null {
  if (!isRecord(item)) return null;
  if (typeof item.userId === 'number' || typeof item.userId === 'string') {
    const content = textOf(item.msg) || textOf(item.content);
    return content.trim() ? { role: item.userId ? 'user' : 'assistant', content } : null;
  }
  if (isRecord(item.src) && (typeof item.text === 'string' || typeof item.content === 'string')) {
    const content = textOf(item.text) || textOf(item.content);
    return content.trim() ? { role: item.src.is_human ? 'user' : 'assistant', content } : null;
  }

  const content = textOf(item.content) || textOf(item.mes) || textOf(item.text) || textOf(item.msg) || textOf(item.data);
  if (!content.trim()) return null;

  let role: ImportedMessage['role'];
  if (typeof item.role === 'string') role = roleOf(item.role);
  else if (typeof item.is_user === 'boolean') role = item.is_user ? 'user' : 'assistant';
  else role = 'assistant';
  // ST 旁白（/sys）：extra.type = narrator → 本站 system 角色消息
  if (isRecord(item.extra) && item.extra.type === 'narrator' && !item.is_user) role = 'system';
  const hidden = item.is_system === true || item.hidden === true;

  // ST 把隐藏消息记成 is_system（/hide）；没有 role 的系统消息仍按 assistant 导入
  const swipes = Array.isArray(item.swipes) ? item.swipes.map(textOf).filter((text) => text.trim()) : [];
  const selected = Number.isInteger(item.swipe_id) && Number(item.swipe_id) >= 0 && Number(item.swipe_id) < swipes.length ? Number(item.swipe_id) : 0;
  return {
    role,
    content,
    ...(swipes.length > 1 ? { candidates: swipes, selected } : {}),
    ...(hidden ? { hidden: true } : {}),
    ...(isRecord(item.extra) && typeof item.extra.reasoning === 'string' && item.extra.reasoning.trim() ? { reasoning: { t: item.extra.reasoning, ms: Number(item.extra.reasoning_duration) || 0 } } : {}),
  };
}

export function parseChatImport(text: string): ParsedChatImport | null {
  const source = String(text ?? '').trim();
  if (!source) return null;
  const messages: ImportedMessage[] = [];
  let title = '';

  let whole: unknown = null;
  try {
    whole = JSON.parse(source);
  } catch {
    whole = null;
  }

  // ---------- 整份 JSON ----------
  if (isRecord(whole)) {
    const data = whole;
    const story = isRecord(data.chat_metadata) && isRecord(data.chat_metadata.cai_story) ? data.chat_metadata.cai_story : null;
    if (story && typeof story.title === 'string') title = story.title;
    else if (typeof data.title === 'string') title = data.title;
    else if (typeof data.name === 'string') title = data.name;

    if (Array.isArray(data.messages)) {
      for (const item of data.messages) {
        const message = messageFrom(item);
        if (message) messages.push(message);
      }
    } else if (Array.isArray(data.data_visible)) {
      for (const pair of data.data_visible) {
        if (!Array.isArray(pair)) continue;
        const user = textOf(pair[0]);
        const assistant = textOf(pair[1]);
        if (user.trim()) messages.push({ role: 'user', content: user });
        if (assistant.trim()) messages.push({ role: 'assistant', content: assistant });
      }
    } else if (data.type === 'risuChat' && isRecord(data.data) && Array.isArray(data.data.message)) {
      for (const item of data.data.message) {
        const message = messageFrom(item);
        if (message) messages.push(message);
      }
    } else if (isRecord(data.histories) && Array.isArray(data.histories.histories)) {
      const first = data.histories.histories[0];
      const list = isRecord(first) && Array.isArray(first.msgs) ? first.msgs : [];
      for (const item of list) {
        const message = messageFrom(item);
        if (message) messages.push(message);
      }
    } else if (!Array.isArray(data.messages)) {
      return null;
    }
    return messages.length ? { title, messages } : null;
  }

  if (Array.isArray(whole)) {
    for (const item of whole) {
      const message = messageFrom(item);
      if (message) messages.push(message);
    }
    return messages.length ? { title, messages } : null;
  }

  // ---------- JSONL ----------
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  let first: unknown = null;
  try {
    first = JSON.parse(lines[0]);
  } catch {
    return null;
  }
  if (!isRecord(first)) return null;

  const isHeader = first.chat_metadata !== undefined || first.user_name !== undefined || first.character_name !== undefined || first.type === 'story-metadata';
  const story = isRecord(first.chat_metadata) && isRecord(first.chat_metadata.cai_story) ? first.chat_metadata.cai_story : null;
  if (story && typeof story.title === 'string') title = story.title;
  else if (first.type === 'story-metadata' && typeof first.title === 'string') title = first.title;
  else if (typeof first.character_name === 'string' && first.character_name !== 'unused') title = first.character_name;

  // 本站导出的 .jsonl 没有表头，第一行就是消息
  const body = isHeader ? lines.slice(1) : lines;
  for (const line of body) {
    let item: unknown = null;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    const message = messageFrom(item);
    if (message) messages.push(message);
  }

  if (!messages.length) return null;
  return { title, messages };
}
