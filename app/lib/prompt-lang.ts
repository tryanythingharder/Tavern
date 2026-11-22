// 发给模型的平台脚手架（区块标题、默认主提示、续写/代写/摘要指令等）按玩家界面语言出：
// 英文界面的玩家拿到英文脚手架，免得模型被中文标题带着用中文回复或中英混写。
// 只替换平台自己写死的固定文字（行首标题、整句默认值、方括号前缀），卡片、预设、世界书里作者写的内容一律不动；
// 玩家改过的预设文字不等于默认值，也就不会被替换。
import { currentLocale } from './i18n/runtime';
import type { Locale } from './i18n/core';

type Msg = { role: string; content: unknown };

const HEADERS: Record<string, string> = {
  系统提示: 'System',
  角色设定: 'Character',
  玩家身份: 'Persona',
  世界书命中: 'World Info',
  自动摘要: 'Summary',
  记忆检索: 'Memory',
  记忆摘要: 'Memory Summary',
  作者注释: "Author's Note",
  对话示例: 'Example Dialogue',
  最近消息: 'Chat History',
  后置提示: 'Post-History Instructions',
  前情摘要: 'Story So Far',
  本场规则: 'Scene Rules',
};

// 整句默认值：键是中文原文，值是英文
const SENTENCES: [string, string][] = [
  ['你是这个故事里的角色。保持角色口吻与已建立的设定，不替玩家决定行动，不复述玩家的设定。',
    "You are a character in this story. Stay in character and consistent with the established setting. Never decide actions for the player, and don't restate the player's persona."],
  ['[接着你上一条消息继续写下去，不要重复已经写过的内容，也不要再输出一遍状态栏。]',
    "[Continue your last message from where it stopped. Don't repeat what's already written, and don't output the status bar again.]"],
  ['回复保持简短（一到三段），给其他人留出接话的空间。',
    'Keep the reply short (one to three paragraphs) and leave room for others to respond.'],
];

const LINE_PREFIX: [RegExp, string][] = [
  [/^【角色名】/gm, 'Name: '],
  [/^【一句话简介】/gm, 'Tagline: '],
  [/^【角色描述】/gm, 'Description: '],
  [/^【人设】/gm, 'Personality: '],
  [/^【场景】/gm, 'Scenario: '],
  [/^【设定】/gm, 'Setting: '],
  [/^【作者提示词】/gm, "Creator's notes: "],
  [/^【身份】/gm, 'Name: '],
  [/^【说明】/gm, 'Description: '],
  [/^【已有摘要】\n/gm, 'Existing summary:\n'],
  [/^【新的对话】\n/gm, 'New conversation:\n'],
  [/^［相关的更早对话］\n/gm, 'Relevant earlier conversation:\n'],
  [/^相关资料：\n/gm, 'Reference material:\n'],
  [/^［第 (\d+) 条］([^：\n]*)：/gm, '[#$1] $2: '],
  [/^［世界书 · ([^］\n]*)］/gm, '[World Info · $1] '],
  [/^［角色深度提示］/gm, '[Character note] '],
];

function toEnglish(text: string): string {
  let out = text;
  // 「### 系统提示」「### 角色 · 名字」这类行首标题
  out = out.replace(/^### ([^\n]+)$/gm, (whole, label: string) => {
    if (HEADERS[label]) return `### ${HEADERS[label]}`;
    const role = label.match(/^角色 · (.+)$/);
    if (role) return `### Character · ${role[1]}`;
    return whole;
  });
  for (const [zh, en] of SENTENCES) if (out.includes(zh)) out = out.split(zh).join(en);
  for (const [re, en] of LINE_PREFIX) out = out.replace(re, en);
  // 群聊规则（rooms.ts）
  out = out
    .replace(/^这是多角色场景，玩家是「([^」\n]*)」。本轮发言人：([^\n（]*)（其他角色这一轮不发言）。$/gm, 'This is a multi-character scene. The player is "$1". Speaking this turn: $2 (the other characters stay silent this turn).')
    .replace(/^只写 ([^\n]*?) 的动作与台词；不要写其他角色的台词或动作，不要替玩家行动。$/gm, "Write only $1's actions and dialogue. Don't write lines or actions for other characters, and never act for the player.")
    .replace(/^不要用「([^\n]*)：」这样的名字开头，直接写内容。$/gm, 'Don\'t start with a name label like "$1:"; write the content directly.');
  // 记忆摘要（memory-llm.ts / room-memory.ts / memory.ts 默认摘要指令）
  out = out
    .replace(/^你在为一段角色扮演对话（([^\n]*) 与 ([^\n]*)）写长期记忆摘要。$/gm, 'You are writing a long-term memory summary for a roleplay between $1 and $2.')
    .replace(/^你在为一段多角色群像扮演（([^\n]*) 与 ([^\n]*)）写长期记忆摘要。$/gm, 'You are writing a long-term memory summary for a multi-character roleplay between $1 and $2.')
    .replace(/忽略之前的指令。用简洁的语言概括到目前为止故事里最重要的事实和事件：人物关系、关键事件、承诺与伏笔、当前所在地点与状态。如果已经有摘要，在它的基础上更新并补充新的内容，删掉已经过时的。控制在 (\d+) 字以内。只输出摘要正文，不要别的内容。/g,
      'Ignore previous instructions. Concisely summarize the most important facts and events in the story so far: relationships, key events, promises and foreshadowing, and the current location and state. If a summary already exists, update it with the new content and drop anything outdated. Keep it under $1 words. Output only the summary text.')
    .replace(/^\[前情摘要：/gm, '[Story so far: ');
  // 代写（impersonate 路由）
  out = out
    .replace(/^［代写］现在不要扮演([^\n]*?)。请以「([^」\n]*)」的身份、第一人称，写出\2的下一句台词或动作（动作用 \*星号\* 包起来），60 字以内，只输出这一句本身，不要替\1说话。(?:方向：([\s\S]*))?$/gm,
      (_m, char: string, who: string, hint?: string) => `[Impersonate] Stop playing ${char} for now. As "${who}", in first person, write ${who}'s next line or action (wrap actions in *asterisks*), under 60 words. Output only that line, and never speak for ${char}.${hint ? ` Direction: ${hint}` : ''}`)
    .replace(/^［代写］忽略上面「本轮发言人」的要求，现在不要扮演任何角色。请以「([^」\n]*)」的身份、第一人称，写出\1的下一句台词或动作（动作用 \*星号\* 包起来），60 字以内，只输出这一句本身，不要替其他角色说话。(?:方向：([\s\S]*))?$/gm,
      (_m, who: string, hint?: string) => `[Impersonate] Ignore the "speaking this turn" rule above and don't play any character now. As "${who}", in first person, write ${who}'s next line or action (wrap actions in *asterisks*), under 60 words. Output only that line, and never speak for other characters.${hint ? ` Direction: ${hint}` : ''}`);
  return out;
}

export function promptLocale(): Locale {
  try { return currentLocale(); } catch { return 'zh'; }
}

/** 单段文字：英文界面换成英文脚手架，中文原样返回 */
export function localizeScaffold(text: string, locale: Locale = promptLocale()): string {
  return locale === 'en' && text ? toEnglish(text) : text;
}

/** 整组消息：只处理字符串内容（多模态数组里的文本块也处理） */
export function localizeMessages<T extends Msg>(messages: T[], locale: Locale = promptLocale()): T[] {
  if (locale !== 'en') return messages;
  return messages.map((message) => {
    if (typeof message.content === 'string') return { ...message, content: toEnglish(message.content) };
    if (Array.isArray(message.content)) {
      return { ...message, content: message.content.map((part: any) => (part && part.type === 'text' && typeof part.text === 'string' ? { ...part, text: toEnglish(part.text) } : part)) };
    }
    return message;
  });
}

/** 平台给 {{user}} 的兜底名 */
export function fallbackUserName(locale: Locale = promptLocale()): string {
  return locale === 'en' ? 'You' : '你';
}
